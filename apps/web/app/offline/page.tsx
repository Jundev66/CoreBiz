import Link from 'next/link';
import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Logo } from '@/ui/logo';
import { buttonClasses } from '@/ui/button';

export const metadata = {
  title: 'Sin conexión a Internet · CoreBiz ERP',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-subtle px-4 text-center">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex justify-center mb-6">
          <Logo name="CoreBiz" />
        </div>

        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-warn-soft text-warn-ink">
          <WifiOff aria-hidden="true" className="size-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Sin conexión a Internet
        </h1>

        <p className="mt-2.5 text-sm text-muted leading-relaxed">
          CoreBiz protege la integridad de tu inventario y finanzas exigiendo conexión segura con el
          servidor para registrar transacciones y garantizar el aislamiento multi-tenant.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link href="/" className={buttonClasses({ variant: 'primary', size: 'md' })}>
            <RefreshCw aria-hidden="true" className="size-4" />
            <span>Reintentar conexión</span>
          </Link>
          <Link href="/" className={buttonClasses({ variant: 'secondary', size: 'md' })}>
            <Home aria-hidden="true" className="size-4" />
            <span>Ir al inicio</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
