#!/usr/bin/env bash
#
# CoreBiz emite NOTAS DE ENTREGA: documentos internos SIN valor fiscal.
#
# El negocio para el que se disena no puede emitir facturas fiscales, asi que dejar
# que el vocabulario de facturacion se cuele en el producto no es un descuido de estilo
# — es lo que haria que un documento generado por la aplicacion pareciese algo que
# legalmente no es. Este check mantiene esa frontera visible y verificada.
#
# Si necesitas usar una de estas palabras de forma legitima (por ejemplo, explicando
# en la documentacion por que NO se emiten facturas), anadela a ALLOWED_FILES.

set -euo pipefail

# Terminos prohibidos en el codigo del producto.
FORBIDDEN=(
  'factura'
  'invoice'
  'seniat'
  'numeracion de control'
  'numero de control'
  'iva declarado'
)

# Archivos donde SI se puede hablar de facturacion, porque su proposito es explicar
# que CoreBiz no la hace.
ALLOWED_FILES=(
  'README.md'
  'docs/'
  'scripts/check-non-fiscal.sh'
  '.github/workflows/ci.yml'
  'CHANGELOG.md'
)

build_exclude_args() {
  for f in "${ALLOWED_FILES[@]}"; do
    printf ':(exclude)%s\n' "$f"
  done
}

status=0
mapfile -t exclusions < <(build_exclude_args)

for term in "${FORBIDDEN[@]}"; do
  # -I ignora binarios, -i sin distinguir mayusculas, -n con numero de linea.
  if matches=$(git grep -Iin -- "$term" -- . "${exclusions[@]}" 2>/dev/null); then
    echo "ERROR: se encontro vocabulario fiscal prohibido: '$term'"
    echo "$matches"
    echo ""
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "-------------------------------------------------------------------"
  echo "CoreBiz genera NOTAS DE ENTREGA, no facturas fiscales."
  echo "Renombra el termino o justifica la excepcion en ALLOWED_FILES."
  echo "-------------------------------------------------------------------"
  exit 1
fi

echo "OK: no aparece vocabulario de facturacion fiscal en el codigo del producto."
