'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Alterna el plan del tenant de demostracion.
 *
 * Existe por una razon de producto, no tecnica: en una demo publica, un modulo
 * bloqueado sin forma de mirar dentro deja a casi todo el mundo sin ver la parte del
 * sistema que mas trabajo costo. Con esto se pueden ver los dos lados del gate.
 *
 * Escribe una cookie de sesion; el servidor la lee al montar el contexto del tenant.
 * En el producto real, el plan vendria de la base de datos.
 */
export function PlanToggle({
  current,
  cookieName,
  label,
}: {
  current: 'free' | 'pro';
  cookieName: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = current === 'free' ? 'pro' : 'free';
    document.cookie = `${cookieName}=${next}; path=/; SameSite=Lax`;
    startTransition(() => router.refresh());
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="rounded-md border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] transition disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
