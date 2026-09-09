# @corebiz/prisma-client

El cliente de Prisma generado. **No se edita a mano y no se commitea**: lo produce
`pnpm db:generate` a partir de `packages/db/prisma/schema.prisma`.

## Por que es un paquete aparte

Porque `output` tiene que apuntar a algun sitio, y meterlo dentro de `packages/db/src/`
mezclaria codigo generado con codigo escrito en el mismo directorio que el resto del
monorepo lee como fuente. Separarlo hace evidente cual de los dos es cual.

## Por que no hay paso de compilacion

El generador `prisma-client` de Prisma 7 emite **TypeScript en crudo**, igual que se
consumen todos los demas paquetes de este repositorio. Por defecto lo emite en ESM, con
`import.meta.url` e imports terminados en `.ts`; `apps/api` compila a CommonJS y asi no
compilaria. Las dos opciones del generador (`moduleFormat = "cjs"` e
`importFileExtension = ""`) lo alinean con la convencion del repositorio.

Con la generacion anterior de Prisma esto habria exigido empaquetar JavaScript compilado
y sacarlo de la resolucion de `tsc-alias`, con el riesgo de que la API arrancase en CI
—donde corre en memoria— y fallase en produccion en la primera consulta.

## Que NO hay que hacer aqui

Ejecutar `prisma migrate`. Las migraciones son de Supabase (`supabase/migrations/*.sql`)
y llevan politicas RLS y funciones `SECURITY DEFINER` que Prisma no ve: compararia
contra una base sombra sin ellas y generaria un diff que las borra.
