'use client';

import { useEffect } from 'react';

/**
 * Registrador silencioso del Service Worker para CoreBiz PWA.
 *
 * Se ejecuta únicamente en el navegador (Client Component) y registra
 * `/sw.js` para habilitar la experiencia PWA instalable y el fallback offline.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Registrar tras carga para no competir con el rendering inicial
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Silencioso: si el entorno o CSP de desarrollo no lo permite, no rompe la UI
        });
      });
    }
  }, []);

  return null;
}
