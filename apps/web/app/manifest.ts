import type { MetadataRoute } from 'next';

/**
 * Manifest oficial PWA de CoreBiz ERP.
 *
 * Configura la aplicación para ser completamente instalable en:
 * - Dispositivos móviles (Android / iOS con modo standalone y pantalla completa).
 * - Escritorio (Chrome, Edge, Safari como Progressive Web App independiente sin barra de navegador).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CoreBiz · Sistema de Gestión Comercial y ERP',
    short_name: 'CoreBiz',
    description:
      'Sistema ERP multi-tenant de inventario, ventas, compras y analítica comercial con arquitectura DDD táctico.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#4f46e5',
    orientation: 'any',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
