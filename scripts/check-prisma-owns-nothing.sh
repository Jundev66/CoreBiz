#!/usr/bin/env bash
#
# Supabase manda las migraciones. Prisma solo LEE el esquema.
#
# `prisma migrate` compara el esquema contra una base sombra que se crea vacia, y la
# diferencia la aplica como migracion. Esa base sombra no tiene NADA de lo que sostiene
# este sistema: ni las politicas RLS, ni las funciones SECURITY DEFINER, ni los indices
# parciales, ni los REVOKE sobre audit_log. Todo eso le parece sobrante, y el diff que
# genera las BORRA.
#
# El aislamiento entre empresas de este producto son esas politicas. Perderlas no es un
# fallo que de un error: es que a partir de ese despliegue cada empresa ve las demas.
#
# Por eso el esquema entra solo por introspeccion (`pnpm db:pull`) y este guardian
# comprueba que nadie ha abierto la otra puerta. Es barato y la alternativa no tiene
# vuelta atras.

set -euo pipefail

status=0

# 1. El directorio que crearia `prisma migrate dev`.
if [ -d 'packages/db/prisma/migrations' ]; then
  echo "ERROR: existe packages/db/prisma/migrations/"
  echo "  Las migraciones son de Supabase (supabase/migrations/*.sql)."
  status=1
fi

# 2. Cualquier invocacion en los scripts de npm o en CI.
#
#    Los COMENTARIOS quedan fuera, y no es una concesion: la primera version de este
#    guardian se disparo con el comentario del PROPIO job de CI que explica por que no hay
#    que usar el comando. Una regla que impide explicar el peligro que vigila esta mal
#    escrita, y quien la sufra acabara desactivandola entera — que es el peor final
#    posible para un guardian.
invocaciones=$(
  grep -rn --include='package.json' --include='*.yml' --include='*.yaml' \
    -E 'prisma[[:space:]]+migrate' . \
    --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null \
    | grep -vE ':[[:space:]]*#' || true
)

if [ -n "$invocaciones" ]; then
  echo "ERROR: alguien invoca 'prisma migrate':"
  echo "$invocaciones"
  status=1
fi

if [ "$status" -ne 0 ]; then
  echo "-------------------------------------------------------------------"
  echo "El esquema se introspecciona, no se genera: 'pnpm db:pull'."
  echo "Para cambiar la base, escribe una migracion en supabase/migrations/."
  echo "-------------------------------------------------------------------"
  exit 1
fi

echo "OK: Prisma no gestiona migraciones; Supabase sigue siendo la fuente."
