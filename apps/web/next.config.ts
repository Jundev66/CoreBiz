import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/*
 * El `.env` de la raiz, tambien para la web.
 *
 * Next solo lee ficheros de entorno de SU directorio, y la API los lee de la raiz. Sin
 * esto habria que mantener la misma variable en dos sitios, y `API_BASE_URL` en uno solo
 * de ellos es exactamente lo que hacia que cada pantalla acabase en la sala de espera
 * como si la API estuviese dormida.
 *
 * Lo que ya esta en el proceso gana: `loadEnvFile` no pisa nada, asi que los ficheros
 * propios de Next (`.env.local`) y las variables del shell siguen mandando.
 */
if (process.env.NODE_ENV !== 'production') {
  const raiz = resolve(import.meta.dirname, '../..', '.env');
  if (existsSync(raiz)) {
    try {
      process.loadEnvFile(raiz);
    } catch {
      // Un `.env` mal escrito no debe impedir arrancar: si falta algo, quien lo necesite
      // lo dira nombrando la variable.
    }
  }
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,

  // Los paquetes del monorepo se consumen como TypeScript en crudo: sin paso de build,
  // sin carpetas dist/ y con recarga en caliente entre paquetes.
  transpilePackages: ['@corebiz/domain', '@corebiz/application', '@corebiz/contracts'],

  // Un error de tipos tiene que romper el despliegue. Desactivarlo es la via mas rapida
  // a un fallo en produccion que el CI ya habia detectado.
  // (Next 16 retiro la opcion de saltarse el lint aqui: corre como job propio en CI.)
  typescript: { ignoreBuildErrors: false },

  // No anunciar el framework ni su version reduce la superficie de reconocimiento.
  poweredByHeader: false,

  experimental: {
    // Los datos de un tenant NUNCA se sirven desde cache compartida.
    staleTimes: { dynamic: 0, static: 180 },
  },
};

export default withNextIntl(config);
