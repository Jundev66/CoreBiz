# ADR 001 — Arquitectura hexagonal con el dominio sin dependencias

- **Estado**: aceptada
- **Fecha**: 2026-09-06

## Contexto

CoreBiz es un ERP: la lógica de negocio (stock, numeración de documentos, conversión de
moneda, cuotas) tiene más valor y más vida útil que el framework que la rodea. Next.js 16
es la elección de hoy; el cálculo de un total con impuesto informativo seguirá siendo
válido cuando ya no lo sea.

## Decisión

El dominio vive en `packages/domain` y **no declara ni una dependencia**. No conoce Next.js,
ni Supabase, ni el ORM, ni siquiera que existe una base de datos.

La separación no se confía a la disciplina de quien escribe. Se hace cumplir en tres niveles:

1. **pnpm con `hoist=false`** — un paquete solo resuelve lo que declaró en su `package.json`.
   Importar `zod` desde el dominio no es un aviso de lint: es un error de resolución.
2. **dependency-cruiser** (`pnpm arch`) — la regla `domain-is-pure` falla el build.
3. **eslint-plugin-boundaries** — vigila los límites _dentro_ de cada paquete: un puerto no
   puede importar un caso de uso, un agregado de ventas no importa entidades de compras.

## Consecuencias

**A favor**

- El dominio se testea sin mocks, sin contenedores y en milisegundos.
- `pnpm dev:nodb` arranca la aplicación entera sin Postgres. Es la prueba observable de que
  la separación es real, no documentada.
- Cambiar de proveedor de persistencia toca `infrastructure`, nada más.

**En contra**

- Más archivos y más indirección que un CRUD acoplado al framework.
- Hay que reimplementar utilidades pequeñas (`Result`, redondeo) en vez de traer una librería.

## Alternativas descartadas

- **Server Actions llamando a Drizzle directamente**: más rápido de escribir, pero la lógica
  de negocio queda repartida entre componentes y no se puede testear sin base de datos.
- **NestJS con inyección por decoradores**: aporta el patrón a cambio de un framework pesado
  y de `reflect-metadata`. El composition root manual da lo mismo en unas 40 líneas.

## Nota sobre la ceremonia

No todo agregado merece el mismo tratamiento. `Customer` y `Supplier` son CRUD casi planos
y **está bien que lo sean**. El músculo hexagonal se demuestra donde hay invariantes reales:
ventas e inventario. Aplicar DDD uniformemente por todas partes sería ceremonia, no diseño.
