# ADR 010 — Prisma en lugar de Drizzle

**Estado:** aceptada · **Fecha:** 2026-09-09
**Supersede:** [ADR 004](004-drizzle-sobre-postgrest.md), en su elección de Drizzle y en su rechazo de Prisma

## Contexto

ADR 004 eligió Drizzle sobre postgres.js y descartó Prisma con una frase:

> **Prisma**: arranque en frío más pesado y peor soporte de SQL crudo para las consultas
> de reporte, que es justo donde más falta hace.

Conviene decir qué ha pasado con esas dos razones, porque no han corrido la misma suerte.

**La primera ya no es cierta.** Prisma 7 no lleva el motor en Rust: el cliente recibe un
adaptador de driver ya conectado. `@prisma/client@7.10.0` depende de un solo paquete de
utilidades y de ningún binario. Desaparecen de golpe los ~150-200 MB de residente sobre
los 512 del plan gratuito de Render, el arranque del motor en cada despertar del servicio
y los binarios por plataforma en el despliegue. La objeción era correcta cuando se
escribió y hoy describe una versión que ya no existe.

**La segunda es cierta a medias.** Hicieron falta tres consultas en SQL crudo, y son justo
las que ADR 004 anticipaba: agregaciones con `round(::numeric)` y casts a texto. Pero
`$queryRaw` las expresa bien, con los valores parametrizados, y el resto del adaptador sí
usa el DSL. No es el problema que se temía.

Nada de esto es, por sí solo, motivo para reescribir 6.000 líneas que funcionaban.

## Decisión

**Se sustituye Drizzle por Prisma en toda la capa de persistencia**, y el motivo es el
mismo que el del [ADR 009](009-api-dedicada-en-nestjs.md): **empleabilidad**.

Prisma aparece en una parte grande de las ofertas de backend en TypeScript. Drizzle es
mejor herramienta para varias de las cosas que este sistema hace —y esta ADR deja escrito
en qué—, pero un repositorio que sirve de carta de presentación se lee también por lo que
demuestra saber usar.

Decirlo así, y no disfrazarlo de necesidad técnica, es deliberado. Un entrevistador que
lea este código va a preguntar por qué se cambió de ORM, y "porque Prisma es lo que pide
la oferta" es una respuesta que se sostiene. "Porque escalaba mejor" no, y la diferencia
se nota justo en esa conversación.

## Lo que se perdió en el cambio, dicho sin adornos

Cuatro cosas que Drizzle hacía y Prisma no. Ninguna es grave; todas están resueltas, y
conviene que consten para quien las encuentre en el código y se pregunte por qué hay SQL
suelto en un proyecto con ORM.

- **El upsert de varias filas.** `products.saveMany` era un `INSERT` de N filas con
  `ON CONFLICT DO UPDATE SET col = excluded.col`. Prisma no tiene `upsertMany`, y la
  alternativa —un `upsert()` por producto— convertiría una nota de quince líneas en quince
  sentencias, cada una con su ida y vuelta mientras la transacción mantiene bloqueadas las
  filas ya tocadas. Se conserva en SQL, con los valores parametrizados por `Prisma.join`.
- **Los upserts con expresión.** El correlativo de documentos
  (`next_number = next_number + 1 … returning`) y el tope inferior del contador de consumo
  (`greatest(0, count - amount)`). El primero es un bloqueo de fila en una sola sentencia:
  partirlo devuelve la carrera en la que dos ventas se llevan el mismo número. El segundo
  no se puede expresar con `{ decrement }`, que baja de cero y haría que la restricción de
  la tabla abortase una transacción legítima.
- **La comparación de tuplas.** La paginación por cursor usaba `(nombre, id) > (…)`, que
  Prisma no expresa. El equivalente es un `OR` de dos ramas, y la segunda no sobra: sin
  ella, dos registros con el mismo nombre hacen que la paginación se salte uno.
- **El tipo de la transacción.** Con Drizzle, pasar el cliente donde se espera una
  transacción no compilaba. En Prisma `TransactionClient` es un subtipo estructural del
  cliente completo, así que ese mismo error _tipa bien_ — y significaría consultar sin
  contexto de empresa puesto, es decir sin aislamiento. Se recupera con un tipo marcado
  cuya propiedad es **obligatoria**; con ella opcional no rechazaba nada.

## Tres diferencias de comportamiento que el driver anterior tapaba

Estas no son pérdidas, son cambios de semántica. Las tres se descubrieron ejecutando, no
leyendo.

- **`undefined` ya no significa `NULL`.** `postgres.js` lo convertía por configuración;
  Prisma **omite** el campo. En un `update`, dejarlo pasar no borra un correo: lo deja como
  estaba.
- **En columnas JSON, `null` escribe el JSON `null`.** Para un `NULL` de SQL hace falta
  `Prisma.DbNull`.
- **Las columnas `bigint` llegan como `BigInt`**, no como cadena. Donde el puerto declara
  `number`, la conversión va en el adaptador — el contrato no cambia por un detalle del
  motor.

Y una que **no** cambió aunque parecía: `contains` de Prisma **no** escapa los comodines
de LIKE. Se comprobó midiendo: con nueve clientes, buscar `%` devolvía los nueve. El
escapado que ya existía sigue haciendo falta.

## Lo que NO cambia

**Supabase sigue mandando el esquema.** Las migraciones son SQL en `supabase/migrations/`,
con sus políticas RLS y sus funciones `SECURITY DEFINER`. Prisma entra solo por
introspección (`pnpm db:pull`), **nunca con `prisma migrate`**: compararía contra una base
sombra que no tiene ninguna de esas piezas y generaría un diff que las borra. El
aislamiento entre empresas de este producto _son_ esas políticas, así que perderlas no
daría un error — daría datos de otra empresa. Hay un guardián en CI
(`scripts/check-prisma-owns-nothing.sh`) que comprueba que nadie abre esa puerta, y se
verificó que falla en los dos casos que vigila.

Tampoco cambia el aislamiento en sí: el Unit of Work sigue poniendo empresa, identidad y
rol como variables **locales a la transacción** ([ADR 005](005-aislamiento-multi-tenant.md)).
Con alcance de sesión quedarían pegadas a la conexión del pool y las heredaría el siguiente
request, que puede ser de otra empresa. Está cubierto por pruebas que **se comprobó que
pueden fallar**: cambiando `local` por sesión a propósito, se caen tres.

Ni cambia nada por encima del adaptador. El dominio, los casos de uso y los puertos no se
tocaron: el ORM vive detrás de una frontera que `dependency-cruiser` vigila. Esa regla sí
hubo que reescribirla, y por un motivo que merece constar — buscaba
`node_modules/drizzle-orm`, y el cliente de Prisma se **genera dentro de un paquete del
workspace**. Con el patrón antiguo habría dejado de ver nada y habría seguido en verde para
siempre, que es peor que no tener regla. Ahora cubre las tres formas, y se comprobó colando
un import de Prisma en el dominio.

## Alternativas descartadas

- **Quedarse con Drizzle.** Técnicamente lo mejor: menos capas, SQL más directo, y ninguno
  de los cuatro huecos de arriba. Se descarta por el motivo declarado en la decisión.
- **Los dos ORM conviviendo**, Prisma para lo nuevo y Drizzle para lo existente. Describir
  el mismo esquema en tres sitios —el SQL de las migraciones, Drizzle y Prisma— y
  mantener los tres en sintonía. Además es lo primero que preguntarían en una entrevista,
  y no tiene buena respuesta.
- **Mantener `postgres.js` bajo Prisma.** No hay adaptador: `@prisma/adapter-pg` usa
  node-postgres. El cambio de driver trae de vuelta la trampa de las sentencias preparadas
  contra el pooler de Supabase, **invisible en local** porque ahí el pooler está apagado.
  Está anotado en la factoría del cliente para quien añada un `name` a una consulta.
