import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,

  // Los paquetes del monorepo se consumen como TypeScript en crudo: sin paso de build,
  // sin carpetas dist/ y con recarga en caliente entre paquetes.
  transpilePackages: [
    '@corebiz/domain',
    '@corebiz/application',
    '@corebiz/contracts',
    '@corebiz/testing',
  ],

  // Un error de tipos o de lint tiene que romper el despliegue. Desactivar esto es la
  // via mas rapida a un fallo en produccion que el CI ya habia detectado.
  // Un error de tipos tiene que romper el despliegue. Desactivarlo es la via mas rapida
  // a un fallo en produccion que el CI ya habia detectado.
  // (Next 16 retiro la opcion : el lint corre como job propio en CI.)
  typescript: { ignoreBuildErrors: false },

  // No anunciar el framework ni su version reduce la superficie de reconocimiento.
  poweredByHeader: false,

  experimental: {
    // Los datos de un tenant NUNCA se sirven desde cache compartida.
    staleTimes: { dynamic: 0, static: 180 },
  },
};

export default withNextIntl(config);
