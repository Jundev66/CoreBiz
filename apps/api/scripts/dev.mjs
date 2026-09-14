import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El bucle de desarrollo de la API.
 *
 * Existe porque `tsc-alias --watch` CORROMPE EL CODIGO FUENTE, y no es una
 * exageracion: reescribe los imports de los ficheros de `packages/**` como si fuesen su
 * copia emitida, dejando rutas del estilo `../../../../../dist/packages/db/src/index`
 * — cinco niveles arriba, o sea FUERA del repositorio. `packages/infrastructure` deja
 * de compilar y el arbol de git aparece con decenas de ficheros tocados que nadie ha
 * editado.
 *
 * Se reprodujo a proposito: borrar `apps/api/dist`, lanzar `tsc --watch` y
 * `tsc-alias --watch` juntos, y esperar. Con `dist` ya al dia no pasa nada, porque tsc
 * no emite; hace falta la emision completa en frio, que es justo lo que ocurre la
 * primera vez que alguien clona el repositorio y escribe `pnpm dev`.
 *
 * The root cause is `rootDir: "../.."` in `tsconfig.json`: the build spans all of
 * `packages/` and the tsc-alias watcher mistakes the output file for its source. The
 * SINGLE-PASS mode does not have that problem — it is what `pnpm build` uses and what
 * produces the artifact Vercel runs.
 *
 * Por que se espera al aviso de tsc en lugar de vigilar `dist`: probe a disparar la
 * pasada cuando cambiaban ficheros de `dist`, y algunos se alineaban ANTES de que tsc
 * terminase de escribirlos. El resultado era un `require("@corebiz/domain")` sin
 * reescribir, Node siguiendo los `exports` del paquete hasta el `.ts` crudo y un
 * ERR_MODULE_NOT_FOUND que no habla de nada de esto. Esperar la linea de tsc reproduce
 * exactamente el orden de `pnpm build`: primero compilar del todo, despues alinear.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const entrada = resolve(raiz, 'dist/apps/api/src/main.js');

const hijos = [];

function lanzar(comando, argumentos, opciones = {}) {
  const hijo = spawn(comando, argumentos, {
    cwd: raiz,
    shell: process.platform === 'win32',
    ...opciones,
  });
  hijos.push(hijo);
  return hijo;
}

let alineando = false;
let servidorLanzado = false;

/** Reescribe los alias de `dist`. Una pasada, nunca un vigilante. */
function alinear() {
  if (alineando) return;
  alineando = true;

  lanzar('npx', ['tsc-alias', '-p', 'tsconfig.build.json'], { stdio: 'inherit' }).on(
    'exit',
    (codigo) => {
      alineando = false;
      if (codigo !== 0) {
        console.error('[alias] fallo la reescritura; no se arranca con dist a medias');
        return;
      }
      // `node --watch` se encarga de reiniciar solo en las siguientes pasadas.
      if (!servidorLanzado && existsSync(entrada)) {
        servidorLanzado = true;
        lanzar('node', ['--watch', entrada], { stdio: 'inherit' });
      }
    },
  );
}

const tsc = lanzar('npx', ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput']);

// Se lee la salida de tsc para saber CUANDO ha terminado de emitir. Es el unico
// momento seguro para alinear.
let resto = '';
tsc.stdout.on('data', (trozo) => {
  process.stdout.write(trozo);
  resto += trozo.toString();
  const lineas = resto.split('\n');
  resto = lineas.pop() ?? '';
  for (const linea of lineas) {
    if (/Watching for file changes/i.test(linea)) alinear();
  }
});
tsc.stderr.on('data', (trozo) => process.stderr.write(trozo));

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    for (const hijo of hijos) hijo.kill();
    process.exit(0);
  });
}
