import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { buttonClasses } from '@/ui/button';
import { CHIP, type Tone } from '@/ui/module-tone';

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
    <div className={`rounded-card border border-line bg-surface shadow-sm ${className}`}>
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
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** The colour of the icon chip, so four figures side by side do not look like one. */
  tone?: Tone;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon !== undefined && (
          <span className={`grid size-9 shrink-0 place-items-center rounded-control ${CHIP[tone]}`}>
            <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">
        {value}
      </p>
      {hint !== undefined && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
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
      className="-ml-1 inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
      {children}
    </Link>
  );
}

/** Boton secundario, en forma de enlace. */
export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClasses({ variant: 'secondary' })}>
      {children}
    </Link>
  );
}
