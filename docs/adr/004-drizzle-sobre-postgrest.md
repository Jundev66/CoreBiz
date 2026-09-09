# ADR 004 — Drizzle sobre postgres.js, no el cliente PostgREST de Supabase

- **Estado**: SUPERSEDIDA por [ADR 010](010-prisma-en-lugar-de-drizzle.md)
- **Fecha**: 2026-09-06

> **Lo que sigue siendo cierto de esta ADR:** todo lo que dice sobre por que NO se usa el
> cliente PostgREST de Supabase, y los detalles del pooler, el tamano del pool y
> `SET LOCAL`. El ORM cambio; el razonamiento sobre transacciones no.
>
> **Lo que ya no:** la eleccion de Drizzle, y el rechazo de Prisma que hay mas abajo. Su
> primera razon —el arranque en frio— dejo de ser cierta con Prisma 7, que no lleva motor
> en Rust. La segunda resulto cierta a medias. El motivo real del cambio no fue tecnico:
> esta escrito en la [ADR 010](010-prisma-en-lugar-de-drizzle.md).

## Contexto

Emitir una nota de entrega toca, en un solo acto de negocio: la secuencia de numeración, la
cabecera del documento, sus líneas, los movimientos de stock, el saldo de cada producto, el
contador de uso y el audit log.

O ocurre todo, o no ocurre nada. Un fallo a mitad deja el inventario descuadrado, y un
inventario descuadrado es un ERP en el que ya nadie confía.

## Decisión

Se accede a los datos con **Drizzle ORM sobre postgres.js**, no con `supabase-js`.
PostgREST no ofrece transacciones multi-tabla ni `SELECT ... FOR UPDATE`, que hace falta
para consumir la secuencia de numeración sin condiciones de carrera.

`supabase-js` se sigue usando, pero solo para lo que hace bien: autenticación
(`getClaims`, refresco de cookies en el middleware) y Storage.

## Detalles que rompen en producción si se ignoran

- **Runtime serverless → pooler Supavisor en el puerto 6543** (modo transacción).
- Ese modo **no soporta prepared statements** → `postgres(url, { prepare: false })`.
  Sin esto todo funciona en local y falla de forma intermitente en producción bajo carga,
  con errores del tipo `prepared statement "s1" does not exist`.
- **Las migraciones van por conexión directa (5432)**, no por el pooler: el modo transacción
  no admite las sentencias múltiples que una migración necesita.
- **`max: 1`** con singleton de módulo y `idle_timeout: 20`. Sin esto, con tráfico moderado
  aparece `max client connections reached` justo cuando alguien está mirando el sitio.
- **`SET LOCAL`, nunca `SET`**, para el contexto de tenant. Ver ADR 005.
- La función debe declarar `runtime = 'nodejs'`: `postgres.js` no corre en el runtime Edge.

## Alternativas descartadas

- **Envolver todo en funciones RPC de Postgres**: da transacciones, pero mueve la lógica de
  negocio a SQL, donde no se puede testear con Vitest ni razonar con tipos.
- **Prisma**: arranque en frío más pesado y peor soporte de SQL crudo para las consultas de
  reporte, que es justo donde más falta hace.

## Addendum (2026-09-07) — dos fallos del cliente que solo aparecen en producción

Esta ADR ya avisaba de que `prepare: false` y el tamaño del pool son decisiones que
funcionan en local y revientan en producción. Aparecieron dos más, de la misma familia, y
merecen quedar escritas porque las dos las encontró la suite E2E y ninguna la habría visto
un test unitario.

**1. El cliente no se reutilizaba en producción.** `getDatabase()` guardaba el cliente en
caché **solo cuando `NODE_ENV !== 'production'`**, con la intención de que el hot reload de
Next no acumulara conexiones huérfanas. El efecto real era el contrario del buscado: en
producción no había caché, así que cada llamada abría un pool nuevo que nadie cerraba.

En desarrollo no se nota. En serverless tampoco mucho, porque la instancia muere. En un
servidor de larga vida —`next start`, un contenedor, un VPS— las conexiones se acumulan
hasta que Postgres responde `FATAL: remaining connection slots are reserved for roles with
the SUPERUSER attribute`, y a partir de ahí la aplicación deja de funcionar entera.

Se manifestó como tests E2E que fallaban sin relación aparente entre sí, siempre
distintos, siempre por tiempo de espera. La caché existe ahora **siempre**, indexada por
cadena de conexión.

**2. Un pool de una conexión serializa un servidor de larga vida.** `max: 1` es correcto en
serverless: cada invocación puede ser un proceso nuevo, y un pool grande por instancia
agota el límite de Supabase en cuanto hay un pico. Pero en un proceso permanente, una
transacción retiene la única conexión mientras dura y todas las demás peticiones esperan
en fila.

Por eso el tamaño es ahora configurable con `DATABASE_MAX_CONNECTIONS`, con **1 por
defecto** —el despliegue objetivo sigue protegido— y la suite E2E lo sube a 10, porque
`next start` es exactamente ese proceso permanente.

Hay un test de integración que cuenta `pg_stat_activity` antes y después de cincuenta
llamadas. Es la única forma de ver esto: un test unitario con un doble no habría notado
nada.
