#!/usr/bin/env bash
#
# Los dos idiomas tienen que declarar exactamente las mismas claves.
#
# Una traduccion que falta no da error: `next-intl` devuelve la clave en crudo, asi que
# la pantalla se pinta con `customers.edit` donde deberia poner "Editar". No rompe nada,
# no aparece en ningun log, y solo lo ve quien abra esa pantalla en ese idioma — que en
# un ERP puede ser dentro de tres meses.
#
# Es justo el fallo que `pnpm approve` NO caza: la pantalla responde 200, trae su
# encabezado y no deja un error de consola. Simplemente esta mal escrita.
#
# Este guardian solo compara el conjunto de claves. No comprueba que la traduccion sea
# buena, porque eso no lo puede saber un script; comprueba que exista, que es lo unico
# que se puede automatizar y lo unico que se olvida.

set -euo pipefail

ES='apps/web/messages/es.json'
EN='apps/web/messages/en.json'

for archivo in "$ES" "$EN"; do
  if [ ! -f "$archivo" ]; then
    echo "ERROR: no existe $archivo"
    exit 1
  fi
done

node --input-type=module -e '
import { readFileSync } from "node:fs";

const [rutaEs, rutaEn] = process.argv.slice(1);

/** Aplana el arbol a claves con punto: `customers.form.name`. */
function claves(valor, prefijo = "") {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return [prefijo];
  return Object.entries(valor).flatMap(([k, v]) =>
    claves(v, prefijo === "" ? k : `${prefijo}.${k}`),
  );
}

function leer(ruta) {
  try {
    return new Set(claves(JSON.parse(readFileSync(ruta, "utf8"))));
  } catch (error) {
    console.error(`ERROR: ${ruta} no es JSON valido — ${error.message}`);
    process.exit(1);
  }
}

const es = leer(rutaEs);
const en = leer(rutaEn);

const faltanEnIngles = [...es].filter((k) => !en.has(k)).sort();
const faltanEnEspanol = [...en].filter((k) => !es.has(k)).sort();

if (faltanEnIngles.length === 0 && faltanEnEspanol.length === 0) {
  console.log(`OK: ${es.size} claves, identicas en los dos idiomas.`);
  process.exit(0);
}

if (faltanEnIngles.length > 0) {
  console.error(`ERROR: ${faltanEnIngles.length} clave(s) en es.json que no estan en en.json:`);
  for (const k of faltanEnIngles) console.error(`  ${k}`);
}

if (faltanEnEspanol.length > 0) {
  console.error(`ERROR: ${faltanEnEspanol.length} clave(s) en en.json que no estan en es.json:`);
  for (const k of faltanEnEspanol) console.error(`  ${k}`);
}

console.error("-------------------------------------------------------------------");
console.error("Anade la clave que falta en el otro idioma antes de continuar.");
console.error("-------------------------------------------------------------------");
process.exit(1);
' "$ES" "$EN"
