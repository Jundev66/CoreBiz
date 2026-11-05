import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, ExternalLink, ArrowLeft, Info, Sparkles } from 'lucide-react';

export default function PosLandingPage() {
  const posUrl = process.env.NEXT_PUBLIC_POS_URL;

  if (posUrl && posUrl.trim().length > 0) {
    redirect(posUrl.trim());
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const devUrl = 'http://localhost:3025';

  return (
    <main className="min-h-screen bg-canvas p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3.5 pb-5 border-b border-line">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <ShoppingCart className="size-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">Terminal POS Offline-First</h1>
              <p className="text-xs text-muted">
                PWA independiente con base de datos local y sincronización outbox
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-xs text-muted leading-relaxed">
            <p>
              El punto de venta de CoreBiz está diseñado como una Progressive Web App autónoma para
              garantizar que el cajero pueda facturar y cobrar sin depender de la conexión al ERP.
            </p>

            {isDev ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="font-bold text-emerald-800 dark:text-emerald-400">
                  Terminal Local Disponible
                </p>
                <p className="mt-1 text-emerald-700 dark:text-emerald-500">
                  El servidor de desarrollo está escuchando en el puerto 3025.
                </p>
                <div className="mt-4">
                  <a
                    href={devUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 cursor-pointer"
                  >
                    <ExternalLink className="size-4" />
                    Abrir Terminal Local ({devUrl})
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-subtle p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="size-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-ink">Configuración de Despliegue en Producción</p>
                    <p className="mt-1">Para conectar el ERP con tu terminal en Vercel por $0:</p>
                  </div>
                </div>

                <ol className="list-decimal list-inside space-y-2 pl-1 text-ink">
                  <li>
                    Desplegá la carpeta{' '}
                    <code className="font-mono font-bold bg-canvas px-1.5 py-0.5 rounded border border-line">
                      apps/pos
                    </code>{' '}
                    en Vercel (Preset Vite).
                  </li>
                  <li>
                    En el panel de tu proyecto{' '}
                    <code className="font-mono font-bold bg-canvas px-1.5 py-0.5 rounded border border-line">
                      corebiz-web
                    </code>{' '}
                    en Vercel, agregá:
                    <div className="mt-1.5 font-mono text-[11px] bg-canvas border border-line p-2.5 rounded-xl select-all">
                      NEXT_PUBLIC_POS_URL=https://tu-pos.vercel.app
                    </div>
                  </li>
                  <li>Al recargar, el ERP abrirá directamente la terminal.</li>
                </ol>
              </div>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-line flex justify-between items-center text-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-ink transition"
            >
              <ArrowLeft className="size-3.5" />
              Volver al ERP
            </Link>

            <Link
              href="/pos-sales"
              className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
            >
              <Sparkles className="size-3.5" />
              Ventas POS
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
