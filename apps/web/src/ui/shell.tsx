import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { TenantContext } from '@corebiz/application';
import { signOutAction, switchTenantAction } from '@/actions/auth';
import type { SessionInfo } from '@/composition/container';

/**
 * Marco comun de las pantallas de la aplicacion.
 *
 * Es un Server Component: la navegacion, el plan y el aviso legal se resuelven en el
 * servidor y al navegador no llega ni una linea de JavaScript por esto.
 */

interface ShellProps {
  readonly ctx: TenantContext;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
  /**
   * Opcional para que una pantalla que aun no la reciba siga compilando. Cuando
   * falta, la barra de cuenta simplemente no se pinta — nunca se asume que haya
   * sesion.
   */
  readonly session?: SessionInfo;
}

export async function Shell({ ctx, session, title, subtitle, action, children }: ShellProps) {
  const t = await getTranslations();

  const nav = [
    { href: '/customers', label: t('nav.customers') },
    { href: '/products', label: t('nav.products') },
    { href: '/delivery-notes', label: t('nav.deliveryNotes') },
    { href: '/reports', label: t('nav.reports'), pro: true },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {t('app.name')}
          </Link>

          <nav aria-label={t('app.name')} className="flex flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm transition hover:bg-[var(--color-canvas)]"
              >
                {item.label}
                {/* El candado se muestra siempre, no se oculta el modulo: saber que
                    existe algo mas es parte de como funciona un freemium honesto. */}
                {item.pro && !ctx.plan.has('reports') && (
                  <span aria-label="PRO" className="ml-1.5 text-xs opacity-60">
                    🔒
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs uppercase tracking-wide">
              {ctx.plan.code}
            </span>
            {session && <AccountArea session={session} activeTenantId={ctx.tenantId} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-[var(--color-muted)]">{subtitle}</p>}
          </div>
          {action}
        </div>

        {children}
      </main>

      <footer className="mx-auto max-w-6xl border-t border-[var(--color-line)] px-6 py-6">
        <p className="text-sm text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}

/**
 * Quien esta operando y como salir.
 *
 * Se pinta en el servidor y sin una linea de JavaScript: salir es un formulario
 * que hace POST a una Server Action, y cambiar de empresa es un `select` que se
 * envia al elegir. Un menu desplegable con estado de cliente seria mas vistoso y
 * dejaria de funcionar exactamente cuando mas falta hace — con la conexion mala,
 * en un movil viejo, en el mostrador de una tienda.
 *
 * Sin sesion NO se ofrece "cerrar sesion", que no cerraria nada y solo confunde:
 * se ofrece crear una cuenta, que es lo que le falta a quien esta mirando la
 * demostracion.
 */
async function AccountArea({
  session,
  activeTenantId,
}: {
  session: SessionInfo;
  activeTenantId: string;
}) {
  const t = await getTranslations();

  if (session.isPublicDemo) {
    return (
      <Link
        href="/signup"
        className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm transition hover:border-[var(--color-brand)]"
      >
        {t('auth.signup.submit')}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {session.memberships.length > 1 && (
        <form action={switchTenantAction}>
          <label htmlFor="tenantId" className="sr-only">
            {t('auth.switchBusiness')}
          </label>
          <select
            id="tenantId"
            name="tenantId"
            defaultValue={activeTenantId}
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
          >
            {session.memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="submit" className="ml-2 text-sm underline underline-offset-4">
            {t('common.change')}
          </button>
        </form>
      )}

      {session.email !== null && (
        <span className="hidden text-sm text-[var(--color-muted)] sm:inline">{session.email}</span>
      )}

      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm transition hover:border-[var(--color-brand)]"
        >
          {t('auth.signOut')}
        </button>
      </form>
    </div>
  );
}

/** Barra de cuota. Se muestra siempre, no solo al agotarse. */
export function QuotaBar({
  current,
  limit,
  label,
  nearLimitLabel,
}: {
  current: number;
  limit: number;
  label: string;
  nearLimitLabel: string;
}) {
  const ratio = limit === 0 ? 1 : Math.min(1, current / limit);
  const near = ratio >= 0.8;

  return (
    <div className="text-right">
      <p className="text-sm font-medium">{label}</p>
      <div
        className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-line)]"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={label}
      >
        <div
          className={near ? 'h-full bg-[var(--color-warn)]' : 'h-full bg-[var(--color-brand)]'}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      {near && <p className="mt-1 text-xs text-[var(--color-warn)]">{nearLimitLabel}</p>}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
    >
      {children}
    </Link>
  );
}

/** Contenedor de tabla con scroll propio: la pagina nunca desborda en movil. */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="w-full border-collapse bg-[var(--color-surface)] text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--color-line)] px-6 py-12 text-center text-[var(--color-muted)]">
      {children}
    </p>
  );
}
