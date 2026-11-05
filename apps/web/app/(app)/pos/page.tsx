import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, ExternalLink, ArrowLeft, Info, Sparkles } from 'lucide-react';
import { Screen } from '@/ui/shell';

export default function PosRedirectPage() {
  const posUrl = process.env.NEXT_PUBLIC_POS_URL;

  if (posUrl && posUrl.trim().length > 0) {
    redirect(posUrl.trim());
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const devUrl = 'http://localhost:3025';

  return (
    <Screen
      title="Terminal de Punto de Venta (POS)"
      subtitle="PWA Offline-First para mostrador y facturación rápida"
    >
      <div className="mx-auto max-w-2xl py-8">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3 pb-4 border-b border-line">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <ShoppingCart className="size-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Terminal POS Offline-First</h2>
              <p className="text-xs text-muted">
                Aplicación web progresiva independiente con catálogo local e IndexedDB
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-xs text-muted leading-relaxed">
            <p>
              El punto de venta de CoreBiz está desacoplado del ERP central para que pueda funcionar
              de forma continua incluso si se interrumpe la conexión a internet.
            </p>

            {isDev ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="font-bold text-emerald-800 dark:text-emerald-400">
                  Entorno Local Detectado
                </p>
                <p className="mt-1 text-emerald-700 dark:text-emerald-500">
                  El servidor de desarrollo del POS se encuentra corriendo en el puerto 3025.
                </p>
                <div className="mt-4">
                  <a
                    href={devUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700"
                  >
                    <ExternalLink className="size-4" />
                    Abrir Terminal Local ({devUrl})
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-subtle p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="size-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-ink">Configuración de Despliegue en Producción</p>
                    <p className="mt-1">
                      Para conectar el ERP con tu terminal en Vercel sin costo adicional:
                    </p>
                  </div>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 pl-2 text-ink">
                  <li>
                    Desplegá la carpeta <code className="font-mono font-bold">apps/pos</code> como
                    un proyecto estático en Vercel (Preset Vite).
                  </li>
                  <li>
                    En la configuración de este proyecto ERP en Vercel, creá la variable de entorno:
                    <div className="mt-1 font-mono text-[11px] bg-canvas border border-line p-2 rounded-lg">
                      NEXT_PUBLIC_POS_URL=https://tu-pos.vercel.app
                    </div>
                  </li>
                  <li>Redesplegá el ERP para que los accesos redirijan automáticamente.</li>
                </ol>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-line flex justify-between items-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink transition"
            >
              <ArrowLeft className="size-3.5" />
              Volver al Inicio del ERP
            </Link>

            <Link
              href="/pos-sales"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              <Sparkles className="size-3.5" />
              Ver Ventas Sincronizadas
            </Link>
          </div>
        </div>
      </div>
    </Screen>
  );
}
