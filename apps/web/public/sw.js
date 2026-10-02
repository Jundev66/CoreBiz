/**
 * CoreBiz Service Worker (PWA)
 *
 * Provee:
 * - Cache de assets estáticos y shell para arranque instantáneo.
 * - Modo network-first para navegación con fallback elegante a /offline.
 * - Sin interferir en peticiones de API o autenticación.
 */
const CACHE_NAME = 'corebiz-v1';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = ['/offline', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Excluir endpoints de backend y de sesión
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/v1/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // Navegación: Network-first con fallback a /offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match(OFFLINE_URL);
        return (
          offlinePage ||
          new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Sin conexión · CoreBiz</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>Sin conexión a Internet</h1><p>Verifica tu conexión de red para continuar operando en CoreBiz.</p></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
            },
          )
        );
      }),
    );
    return;
  }

  // Assets estáticos (iconos, fuentes, CSS/JS de Next): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    }),
  );
});
