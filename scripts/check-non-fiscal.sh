#!/usr/bin/env bash
#
# CoreBiz emite NOTAS DE ENTREGA: documentos internos SIN valor fiscal.
#
# El negocio para el que se disena no puede emitir facturas fiscales, asi que dejar
# que el vocabulario de facturacion se cuele en el producto no es un descuido de estilo
# — es lo que haria que un documento generado por la aplicacion pareciese algo que
# legalmente no es. Este check mantiene esa frontera visible y verificada.
#
# Si necesitas usar una de estas palabras de forma legitima hay dos vias:
#
#   - ALLOWED_FILES, para archivos cuyo proposito ENTERO es explicar que CoreBiz no
#     emite documentos tributarios (README, docs/).
#   - El marcador `no-fiscal-ok` en la propia linea, para el caso contrario: un
#     aviso legal dentro del codigo que NIEGA tener algo. Es exactamente la
#     situacion que dejo este check en rojo durante dos commits sin que nadie se
#     enterase — el aviso de las tablas de venta dice que NO hay numeracion de
#     control, y el guardian solo veia el termino.
#
# La excepcion por linea es la buena por defecto: exceptuar un archivo entero
# apaga la vigilancia sobre todo lo que se escriba en el en el futuro.

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

# Marcador que exime una linea concreta. Va al final del comentario que lo usa.
ESCAPE='no-fiscal-ok'

for term in "${FORBIDDEN[@]}"; do
  # -I ignora binarios, -i sin distinguir mayusculas, -n con numero de linea.
  # El `|| true` es imprescindible con `pipefail`: cuando el filtro se lleva todas
  # las coincidencias, grep sale con 1 y el script moriria dando por bueno el resto.
  matches=$(git grep -Iin -- "$term" -- . "${exclusions[@]}" 2>/dev/null | grep -v "$ESCAPE" || true)

  if [ -n "$matches" ]; then
    echo "ERROR: se encontro vocabulario fiscal prohibido: '$term'"
    echo "$matches"
    echo ""
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "-------------------------------------------------------------------"
  echo "CoreBiz genera NOTAS DE ENTREGA, no facturas fiscales."
  echo "Renombra el termino, marca la linea con 'no-fiscal-ok' si es un aviso"
  echo "legal que lo NIEGA, o justifica el archivo entero en ALLOWED_FILES."
  echo "-------------------------------------------------------------------"
  exit 1
fi

echo "OK: no aparece vocabulario de facturacion fiscal en el codigo del producto."
