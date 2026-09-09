import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Carga el `.env` de la raiz del repositorio, solo en desarrollo.
 *
 * Hacia falta porque la API NO leia ningun fichero de entorno: solo `process.env`.
 * `apps/web/.env.local` alimenta unicamente a Next, asi que desde la migracion a NestJS
 * `pnpm dev` contra Postgres no arrancaba solo, y sin `API_BASE_URL` la web interpretaba
 * el fallo como que la API estaba dormida y mandaba cada pantalla a la sala de espera.
 * Un error de configuracion disfrazado de arranque en frio es de los peores: no se
 * arregla esperando, y la pantalla te invita justo a eso.
 *
 * En produccion NO se llama. Render y Vercel inyectan el entorno ellos mismos, y leer un
 * fichero alli seria darle a un despliegue una fuente de configuracion que nadie audita.
 *
 * Las variables que YA existen en el proceso ganan: `loadEnvFile` de Node no pisa lo que
 * hay. Eso es lo que permite que `DATA_DRIVER=memory pnpm dev` siga funcionando aunque
 * el `.env` diga `postgres`.
 */

function raizDelRepositorio(desde: string): string | null {
  let actual = desde;
  for (;;) {
    if (existsSync(join(actual, 'pnpm-workspace.yaml'))) return actual;
    const padre = dirname(actual);
    if (padre === actual) return null;
    actual = padre;
  }
}

export function cargarEntornoDeDesarrollo(): void {
  if (process.env.NODE_ENV === 'production') return;

  // Se busca desde este fichero y no desde `process.cwd()`: el directorio de trabajo
  // cambia segun quien arranque el proceso (turbo, el lanzador de desarrollo, Playwright
  // o una persona), y el fichero siempre esta en el mismo sitio respecto al codigo.
  const raiz = raizDelRepositorio(__dirname);
  if (raiz === null) return;

  const fichero = resolve(raiz, '.env');
  if (!existsSync(fichero)) return;

  try {
    process.loadEnvFile(fichero);
  } catch {
    // Un `.env` con una linea mal escrita no debe impedir arrancar: puede que todo lo
    // necesario venga ya del propio entorno. Si falta algo, `loadEnv()` lo dira con
    // precision y nombrando la variable.
  }
}
