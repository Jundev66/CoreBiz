# CoreBiz

Sistema de gestión comercial multi-tenant: inventario, ventas y documentos de entrega.
Arquitectura hexagonal en TypeScript, aislamiento de datos con Row Level Security de
PostgreSQL y una pirámide de tests completa.

> **Aviso legal.** CoreBiz genera **notas de entrega**: documentos internos **no fiscales**.
> No emite facturas fiscales, no aplica numeración de control ni cumple los requisitos de
> facturación de ninguna jurisdicción. El campo de impuesto es **informativo** y no constituye
> un tributo declarado. Cada documento generado lleva impresa la leyenda
> _"Documento no fiscal / sin valor fiscal"_.

---

## Qué demuestra este proyecto

|                   |                                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arquitectura**  | Hexagonal (puertos y adaptadores) con DDD táctico y CQRS ligero. El dominio no tiene **ni una** dependencia y una regla de CI lo verifica.                                                                                                     |
| **Multi-tenancy** | Aislamiento en cuatro capas: RLS de Postgres, contexto inyectado en la transacción, filtrado explícito en los repositorios y una matriz de tests que lo comprueba tabla por tabla.                                                             |
| **Testing**       | **497 tests**: 322 unitarios (Vitest + property-based con fast-check), 82 de integración contra Postgres real, 20 escenarios BDD en Gherkin y 73 E2E con Playwright, incluidas accesibilidad con axe y una pasada de aprobación por las rutas. |
| **Seguridad**     | RBAC, audit log inmutable, CSP con nonce, rate limiting, y **ninguna clave capaz de saltarse RLS en el despliegue**. Documentado en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).                                                            |
| **SaaS**          | Multi-tenant con aislamiento probado, demostración efímera por visitante y un circuit breaker que protege el presupuesto de infraestructura.                                                                                                   |

## Stack

**NestJS 11** · **Next.js 16** (App Router) · **TypeScript** · **Supabase** (Postgres, Auth) ·
**Prisma** · **Zod** · **Tailwind CSS** · **Vitest** · **Playwright** + `playwright-bdd`

Dos procesos: una API REST en NestJS que aplica las reglas y habla con Postgres, y una
interfaz en Next.js que la consume **desde el servidor** —el token nunca llega al
navegador—. El núcleo (dominio y casos de uso) no sabe que existe ninguno de los dos, y
esa es la parte que merece mirarse: cambiar el adaptador primario no obligó a tocarlo.

Pensado para desplegarse en Vercel (la web y la API, como dos proyectos) y Supabase, los dos
en plan gratuito, con un coste de infraestructura de **$0**. El recorrido completo está en
[`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Arranque rápido

```bash
corepack enable            # o: npm install -g pnpm
pnpm install
```

### Arrancar

```bash
pnpm db:start              # Supabase local en Docker + migraciones + seed
pnpm dev                   # levanta la API y la interfaz a la vez
```

La interfaz sirve en `:3000` y la API en `:3001`, con su OpenAPI navegable en
[`/docs`](http://localhost:3001/docs) — que **no se publica en producción**, porque un
mapa completo de la superficie de escritura de un ERP es reconocimiento gratis.

Abrir `:3000` en desarrollo deja **dentro**, con la sesión de la cuenta sembrada ya
iniciada: no hay formulario de acceso entre tú y el sistema. Se apaga con
`DEMO_AUTO_LOGIN=false`, y en producción no se aplica nunca — allí la puerta es
`/demo`, que entrega a cada visitante su propia copia.

> **El producto no arranca sin base de datos.** Existen adaptadores en memoria y son
> buenos —sostienen la suite entera sin Docker, que es lo que la hace rápida y gratis en
> CI— pero son **dobles de prueba**, no un modo de uso. Pedirlos exige
> `ALLOW_MEMORY_DRIVER=1`, y sin ese permiso el proceso se niega a levantar en lugar de
> servir datos inventados como si fueran los de la empresa.

### Comandos

| Comando                 | Qué hace                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm check`            | Formato, lint, tipos, arquitectura y tests unitarios. Lo que corre en CI.     |
| `pnpm test:unit`        | Dominio y aplicación. Sin IO, menos de 5 segundos.                            |
| `pnpm test:integration` | Repositorios y **matriz de aislamiento RLS**. Requiere Docker.                |
| `pnpm test:bdd`         | Escenarios Gherkin sobre la aplicación real, en memoria.                      |
| `pnpm test:bdd:pg`      | **Los mismos escenarios**, sin tocar una línea, contra Postgres con RLS.      |
| `pnpm test:e2e:pg`      | La suite E2E entera contra Postgres, incluidos sesión y demo aislada.         |
| `pnpm test:e2e`         | Playwright con trazas y vídeo en los fallos. Arranca las dos aplicaciones.    |
| `pnpm dev:api`          | Solo la API. `pnpm dev:web`, solo la interfaz.                                |
| `pnpm arch`             | Verifica los límites entre capas. **Falla el build si el dominio se acopla.** |
| `pnpm arch:graph`       | Regenera el grafo exhaustivo de dependencias (~900 nodos, ignorado por git).  |

---

## Estructura

```
packages/
  domain/          Reglas de negocio puras. CERO dependencias — mira su package.json.
  application/     Casos de uso y puertos (interfaces). Solo depende de domain.
  contracts/       Esquemas Zod compartidos entre servidor y cliente.
  db/              Esquema de Prisma (introspeccionado) y cliente con su pool.
  infrastructure/  Adaptadores de Postgres: repositorios Prisma, modelos de lectura,
                   Unit of Work, limitador de peticiones y sandbox de demostración.
apps/
  api/             NestJS. Controllers, guards y DTOs como adaptadores primarios.
                   Es quien monta los casos de uso y abre las transacciones.
  web/             Next.js. Server Components y Server Actions, que desde la migración
                   a la API son SOLO transporte: no queda una regla de negocio dentro.
e2e/               Features en Gherkin y specs de Playwright.
supabase/          Migraciones SQL, semilla y RLS: políticas, funciones, triggers, pg_cron.
```

La dirección de las dependencias apunta **siempre hacia adentro**: nada de lo que rodea al
dominio puede filtrarse dentro de él. No es una convención documentada y luego olvidada —
lo comprueba `pnpm arch` en cada push, y romperlo rompe el build.

## Decisiones de arquitectura

Las decisiones con su contexto y sus alternativas descartadas están en [`docs/adr/`](docs/adr/):

1. [Arquitectura hexagonal con el dominio sin dependencias](docs/adr/001-arquitectura-hexagonal.md)
2. [Dinero en bigint y moneda dual con tasa congelada](docs/adr/002-dinero-y-moneda-dual.md)
3. [Notas de entrega en lugar de facturas fiscales](docs/adr/003-notas-de-entrega.md)
4. [Drizzle sobre postgres.js, no PostgREST](docs/adr/004-drizzle-sobre-postgrest.md) — supersedida por la 10
5. [Aislamiento multi-tenant en cuatro capas](docs/adr/005-aislamiento-multi-tenant.md)
6. [Autenticación enteramente en el servidor](docs/adr/006-autenticacion-solo-en-el-servidor.md)
7. [El token de invitación no se guarda](docs/adr/007-invitaciones-con-token-hasheado.md)
8. [La nota se imprime en el navegador, no se genera como PDF](docs/adr/008-imprimir-en-el-navegador.md)
9. [Una API dedicada en NestJS, y Next.js como cliente](docs/adr/009-api-dedicada-en-nestjs.md)
10. [Prisma en lugar de Drizzle, y por que](docs/adr/010-prisma-en-lugar-de-drizzle.md)
    — supersede el rechazo de NestJS que hacía la 001, y **dice el motivo real** en lugar
    de disfrazarlo de necesidad técnica.
11. [La API se despliega en Vercel, no en Render](docs/adr/011-api-en-vercel.md)

El análisis STRIDE completo, con los riesgos aceptados de forma consciente, está en
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Qué falta

El ciclo de venta funciona sobre Postgres real, con las políticas RLS ejecutándose en cada
push y con autenticación de verdad. Lo que queda ya no es fundacional: el **despliegue**, que
es lo único que no se puede hacer desde el repositorio porque necesita cuentas de Supabase y
Vercel. [`docs/ROADMAP.md`](docs/ROADMAP.md) dice exactamente qué queda, en qué
orden y por qué ese orden, incluyendo el estado honesto de cada capa.

### La migración a NestJS no cambió ni un test

Partir el sistema en dos procesos tocó la capa de entrega entera: 36 rutas nuevas, un
cliente HTTP, el composition root movido de sitio. Los **6 ficheros Gherkin y los 6 specs
de Playwright no cambiaron una línea**, y siguen pasando en memoria y contra Postgres.

Eso no es una anécdota: era el criterio de aceptación. Si un solo escenario hubiera
necesitado cambiar, la capa de entrega llevaba lógica de negocio dentro y el hexágono era
un dibujo. Es el mismo argumento con el que el proyecto sostiene que memoria y Postgres
son intercambiables, aplicado a algo más grande.

### La aprobación recorre las veintinueve rutas

`pnpm approve` abre **todas** las pantallas de la aplicación con una sesión real y comprueba en
cada una cuatro cosas: que responde 200, que no redirige a otro sitio, que trae su encabezado, y
que no deja ni un error de consola, ni una excepción sin capturar, ni una violación de la
política de seguridad de contenido.

Existe porque son dos fallos distintos y la suite solo cazaba uno. Una regla mal implementada la
encuentra un escenario BDD; **una pantalla que revienta al abrirse** —porque una consulta cambió
de firma, o porque falta una traducción— no la encuentra nadie hasta que alguien hace clic. Y en
un ERP hay muchas pantallas a las que se hace clic una vez al mes.

Los identificadores de las fichas y los documentos no van escritos: se descubren navegando desde
sus listados. Si un enlace dejara de existir, la aprobación falla por el motivo correcto.

### Lo que falta se dice, no se esconde

Cobros, presupuestos y órdenes de compra **tienen su entrada en el menú, marcada como en
desarrollo**, y cada una abre una pantalla que explica tres cosas: qué hará, por qué no está
todavía, y qué usar mientras tanto.

Esconderlas dejaría el menú más corto y el sistema más difícil de juzgar. Quien evalúa un ERP
busca "cobros" en el primer minuto, y no encontrar ni la pantalla ni una explicación se lee como
que el sistema es incompleto **y además** confuso. Con la marca delante, un hueco pasa a ser un
alcance declarado.

El caso de cobros es el que más se nota: **el límite de crédito ya está implementado y probado
en el dominio**, pero la consulta de saldo pendiente devuelve siempre cero porque no hay cobros
que restar. La regla existe y nunca llega a dispararse. Está dicho en la propia pantalla.

Por el mismo motivo desaparecieron tres indicadores de plan —`dashboard`, `export_csv`,
`multi_warehouse`— que estaban declarados "para más adelante" y que ningún código comprobaba.
Una bandera que no bloquea nada no reserva nada: solo hace creer que la función existe a quien
lee esa lista para saber qué ofrece el producto. Hay un test que impide que vuelvan a acumularse.

### Nadie escribe un código

Dar de alta un cliente pide solo su nombre. El código lo asigna el sistema —`CLT26000001`:
prefijo, año y correlativo— y se muestra en la confirmación.

Pedirlo era pedirle al comercio que resolviera un problema del sistema: inventar un formato el
primer día, recordarlo cada vez, y encontrarse con un rechazo por duplicado cuando dos personas
dan de alta a la vez. El correlativo sale de la misma mecánica que numera las notas de entrega —
un UPSERT que bloquea la fila— que es lo único del sistema que aguanta concurrencia sin dejar
huecos ni repetir.

**El SKU de un producto es la única excepción, y se deja abierta a propósito.** El código de un
producto suele existir antes que el sistema: está impreso en la etiqueta del estante o es el
código de barras del fabricante. Si se escribe, se respeta; si se deja en blanco, se genera.
Cerrarlo obligaría a llevar dos códigos para la misma bolsa de harina, y esa pelea la gana
siempre el que ya está pegado al producto.

### Se archiva, no se borra

Ni clientes, ni productos, ni proveedores tienen botón de eliminar. Un cliente con notas de
entrega emitidas no se puede borrar sin dejar documentos apuntando al vacío, y dentro de ocho
meses alguien va a necesitar saber a quién se le vendió aquello.

Archivar hace lo que la gente quiere cuando dice "bórralo" —dejar de verlo— y además se deshace
en un clic. Los archivados no desaparecen: hay un enlace para verlos. Ocultarlos sin forma de
llegar a ellos convertiría "archivar" en "perder".

Al sacar un producto del catálogo **el inventario que tuviera no se toca**. Si quedaban tres
bolsas en el estante, siguen ahí. Poner el saldo a cero inventaría una salida de mercancía que
nunca ocurrió, y el libro de movimientos dejaría de explicar el saldo — que es lo único que hace
fiable un inventario.

### La demostración entrega credenciales, no una puerta abierta

`/demo` crea una cuenta desechable —correo y contraseña generados— y mete a quien llega en
**su propia copia** del comercio de ejemplo, con la sesión ya iniciada. Puede tocarlo todo,
nadie más ve lo que hace, y la cuenta entera se borra sola a las 24 horas. Sin registro y
sin dar un correo.

Cuatro cosas que la sostienen y que no se ven:

- **La cuenta nace en la misma transacción que su sandbox**, con la misma caducidad, y se la
  lleva la misma purga. Un usuario huérfano no rompe nada visible, y por eso mismo se
  acumularía durante meses sin que nadie lo notase — que es como se llega a un cobro
  inesperado.
- **La provisión va por POST, nunca por GET.** Un GET que provisiona lo dispara cualquier
  rastreador o previsualización de enlace de un chat: publicar el enlace crearía decenas de
  cuentas y de copias de la base antes de que lo abriese una persona.
- **Un disyuntor sobre el tamaño de la base.** Por encima del 70 % del presupuesto se deja
  de clonar y se entrega una cuenta de solo lectura sobre la plantilla compartida, que cuesta
  una fila en vez de sesenta; por encima del 85 % se purga sin esperar al TTL. El visitante
  **siempre entra** — un "vuelve más tarde" en el enlace del CV es el peor resultado posible
  del proyecto entero, porque el momento en que alguien lo abre no se repite.
- **Nunca sale un correo.** El dominio `@corebiz.demo` no existe, así que por mucho que se
  abuse del enlace este sistema no puede convertirse en un emisor de correo hacia terceros.

`DEMO_ENABLED=false` cierra la puerta entera y deja un SaaS normal: el resto del sistema ya
exige sesión siempre.

## Tres detalles que resumen el enfoque

**La arquitectura rompe el build si se viola.** No es una convención documentada: se
comprobó inyectando a propósito un `import { z } from 'zod'` en el dominio, y `pnpm arch`
lo detectó. Además, `pnpm` con `hoist=false` hace que ese import ni siquiera resuelva.

**Los mismos escenarios corren sobre los dos adaptadores.** Los 24 escenarios Gherkin
pasan en memoria y contra Postgres con RLS activo, sin cambiar una línea. Esa es la
comprobación ejecutable de que la arquitectura hexagonal es real: si el dominio supiera que
existe una base de datos, `pnpm test:bdd:pg` no podría existir.

**Los tests encuentran bugs de verdad.** Cuatro ejemplos reales de este repositorio: el
descuento de stock se aplicaba línea a línea, así que un fallo en la última dejaba las
anteriores ya descontadas; la validación de formularios fallaba siempre porque React
inyecta campos propios en el `FormData`; un test de coherencia de la matriz de permisos
detectó una contradicción entre dos reglas que yo mismo había escrito; y la suite E2E
contra Postgres destapó que el cliente de base de datos **no se reutilizaba en
producción** —la caché estaba puesta solo en desarrollo, al revés de lo que hacía falta—
así que cada request abría un pool nuevo hasta agotar las conexiones de Postgres. Ese no
lo ve ningún test unitario: hay que contar conexiones de verdad.

**La tasa de cambio queda congelada en cada documento.** Reimprimir una nota de marzo con
la tasa de septiembre no es un detalle cosmético: reescribiría el histórico contable del
negocio cada vez que alguien abre un PDF antiguo.

---

## Sobre el uso comercial

**Todos los módulos están abiertos y no hay cuotas.** Hubo un modelo freemium completo
—límites por recurso y gating de módulos, aplicados en el dominio— y se retiró: un
candado sobre una función que nadie va a vender no protege ingresos, solo le dice a quien
prueba el sistema que la mitad no es para él. La maquinaria sigue en su sitio y probada
(`packages/domain/src/billing/plan.ts`), con una única definición que hoy lo incluye todo,
así que volver a cobrar sería escribir otra definición, no rehacer el dominio.

**No se cobra por CoreBiz ni se ofrece como servicio comercial**: el plan Hobby de Vercel
está limitado a uso personal no comercial, y respetarlo es parte de conocer la plataforma
sobre la que se construye.

## Licencia

MIT
