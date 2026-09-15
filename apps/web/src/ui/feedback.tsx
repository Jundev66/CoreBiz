import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/**
 * Notices and badges.
 *
 * Error and warning boxes were copied into each file, some with the `-ink` text colour
 * that passes contrast and some without. Here the tone decides every colour at once, so
 * none of them can drift below AA again.
 *
 * `role` is NEVER implied. The screens and their tests count `status` and `alert` regions
 * (a customer page has exactly one status), so each caller says whether the notice is a
 * live region, and a decorative one stays silent.
 */

export type Tone = 'info' | 'success' | 'warn' | 'danger';

const ALERT_TONES: Record<Tone, string> = {
  info: 'border-brand-line bg-brand-soft text-ink',
  success: 'border-success/30 bg-success-soft text-success-ink',
  warn: 'border-warn/40 bg-warn-soft text-warn-ink',
  danger: 'border-danger/30 bg-danger-soft text-danger-ink',
};

const ALERT_ICONS = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  danger: AlertCircle,
} as const;

export function Alert({
  tone = 'info',
  title,
  role,
  className = '',
  children,
}: {
  tone?: Tone;
  title?: string;
  role?: 'alert' | 'status';
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div
      role={role}
      className={`flex gap-3 rounded-control border px-4 py-3 text-sm ${ALERT_TONES[tone]} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        {title !== undefined && <p className="font-medium">{title}</p>}
        <div className={title !== undefined ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-ink-soft ring-line-strong',
  brand: 'bg-brand-soft text-brand ring-brand-line',
  success: 'bg-success-soft text-success-ink ring-success/25',
  warn: 'bg-warn-soft text-warn-ink ring-warn/40',
  danger: 'bg-danger-soft text-danger-ink ring-danger/25',
};

/** A state in words, never colour alone. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
