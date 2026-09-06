# ADR 004 — Drizzle sobre postgres.js, no el cliente PostgREST de Supabase

- **Estado**: aceptada
- **Fecha**: 2026-09-06

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
