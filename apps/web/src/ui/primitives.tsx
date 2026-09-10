import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Las piezas que se repetian a mano en cada pantalla.
 *
 * Antes no existia ninguna: cada boton reescribia su cadena de clases, la tarjeta de
 * cifra vivia dentro de la pagina de reportes y habia CINCO definiciones distintas del
 * campo de formulario repartidas por los formularios. Eso es lo que hace que una
 * interfaz se parezca a si misma por casualidad y no por sistema — y se nota, aunque
 * quien la mira no sepa decir por que.
 */

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Una cifra con su etiqueta.
 *
 * El valor va en tabular para que una columna de importes no baile, y la etiqueta
 * ARRIBA: leer primero que es y despues cuanto evita tener que volver la vista atras.
 */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint !== undefined && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    </Card>
  );
}

/** Encabezado de una seccion dentro de una pantalla. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">{children}</h2>
      {action}
    </div>
  );
}

/**
 * El enlace de volver.
 *
 * Existe porque estaba escrito a mano en seis pantallas con una flecha de texto, y
 * faltaba en otras tres. Una navegacion que a veces ofrece la salida y a veces no es
 * peor que una que nunca la ofrece: quien la busca no sabe si mirar mal o si no esta.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] underline-offset-4 transition hover:text-[var(--color-ink)] hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {children}
    </Link>
  );
}

/** Boton secundario, en forma de enlace. */
export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-subtle)]"
    >
      {children}
    </Link>
  );
}
