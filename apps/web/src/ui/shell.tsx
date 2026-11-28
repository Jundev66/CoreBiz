import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { Inbox, ShoppingCart, UserRound, type LucideIcon } from 'lucide-react';
import { signupConfig } from '@/demo/sandbox';
import { canOpen } from '@/auth/module-access';
import { Toast } from '@/ui/toast';
import { AssistantPanel } from '@/ui/assistant-panel';
import { SidebarNav, type SidebarNavItem } from '@/ui/sidebar-nav';
import type { TenantContext } from '@corebiz/application';
import { signOutAction, switchTenantAction } from '@/actions/auth';
import type { SessionInfo } from '@/api/session';
import { DestroyDemoButton } from '@/ui/destroy-demo-button';
import { buttonClasses } from '@/ui/button';
import { Logo } from '@/ui/logo';
import { BackLink } from '@/ui/primitives';
import { NavDetails } from '@/ui/nav-link';
import { ThemeToggle } from '@/ui/theme-toggle';
import { getPosTerminalUrl } from '@/ui/pos-link';
import { MobileMenuDrawer } from '@/ui/mobile-menu-drawer';

/**
 * Marco comun de las pantallas de la aplicacion.
 *
 * Two pieces, and the split is what makes navigation feel instant:
 *
 * - `AppFrame` is rendered ONCE by `app/(app)/layout.tsx` and stays mounted while moving
 *   between modules. It used to be rendered by every page, so the whole screen — menu
 *   included — waited for the next page's data and was sent again with it.
 * - `Screen` is what changes per page: title, subtitle, actions, the way back, the "done"
 *   notice and the content under them.
 *
 * Two layouts, one frame:
 *
 * - From `lg` up, a TOOL layout: fixed modules on the left, content on the right.
 * - Below it, a PHONE layout: a compact top bar with the account menu and a tab bar at the
 *   bottom, where thumbs are.
 *
 * Both menus are native `<details>`, so they still open with no JavaScript, and close after
 * every navigation (`NavDetails`).
 *
 * The desktop menu comes FIRST in the DOM and the phone copies are `display: none` at that
 * width: the main navigation is still the first visible `navigation`, with links named
 * exactly after their module.
 */

export async function AppFrame({
  ctx,
  session,
  children,
}: {
  readonly ctx: TenantContext;
  readonly session: SessionInfo;
  readonly children: React.ReactNode;
}) {
  const t = await getTranslations();

  /*
   * The menu shows what the system DOES, and what THIS ROLE can open.
   *
   * It used to offer all seven modules to everyone, and three answered with the server error
   * page depending on who clicked. Hiding the entry is NOT the control: the use case enforces
   * the limit and every screen checks again before reading (`NoAccess`).
   */
  const sidebarItems: SidebarNavItem[] = [
    {
      type: 'link' as const,
      item: { href: '/', label: t('nav.home'), icon: 'home' as const, exact: true },
    },
    {
      type: 'group' as const,
      group: {
        id: 'ventas',
        label: 'Ventas',
        icon: 'cart' as const,
        items: [
          { href: '/invoicing', label: 'Facturas de Venta', icon: 'fileText' as const },
          {
            href: '/invoicing/credit-notes',
            label: 'Notas de Crédito & Débito',
            icon: 'fileText' as const,
          },
          { href: '/customers', label: t('nav.customers'), icon: 'users' as const },
        ].filter(({ href }) => canOpen(ctx.actor, href)),
      },
    },
    {
      type: 'group' as const,
      group: {
        id: 'contabilidad',
        label: 'Contabilidad',
        icon: 'banknote' as const,
        items: [
          { href: '/accounting', label: 'Plan de Cuentas', icon: 'fileText' as const },
          {
            href: '/accounting/trial-balance',
            label: 'Balance de Comprobación',
            icon: 'chart' as const,
          },
          { href: '/accounting/journal-entries', label: 'Libro Diario', icon: 'receipt' as const },
          {
            href: '/accounting/payments',
            label: 'Cobros y Pagos (CxC/CxP)',
            icon: 'banknote' as const,
          },
          {
            href: '/accounting/aging',
            label: 'Antigüedad de Deuda (Aging)',
            icon: 'chart' as const,
          },
          {
            href: '/accounting/treasury',
            label: 'Tesorería & Swaps',
            icon: 'banknote' as const,
          },
          {
            href: '/accounting/expenses',
            label: 'Gastos & Logística',
            icon: 'truck' as const,
          },
          { href: '/fiscal/sales-book', label: 'Libro de Ventas', icon: 'fileText' as const },
          { href: '/fiscal/purchases-book', label: 'Libro de Compras', icon: 'truck' as const },
          { href: '/fiscal/us-sales-tax', label: 'Sales Tax US', icon: 'chart' as const },
        ].filter(({ href }) => {
          if (!canOpen(ctx.actor, href)) return false;
          const country = ctx.settings.fiscalCountry;
          if (
            country === 'US' &&
            (href === '/fiscal/sales-book' || href === '/fiscal/purchases-book')
          ) {
            return false;
          }
          if (country === 'VE' && href === '/fiscal/us-sales-tax') {
            return false;
          }
          return true;
        }),
      },
    },
    {
      type: 'group' as const,
      group: {
        id: 'inventario',
        label: 'Inventario',
        icon: 'package' as const,
        items: [
          { href: '/products', label: 'Productos & Stock', icon: 'package' as const },
          { href: '/inventory/transfers', label: 'Depósitos & Traslados', icon: 'truck' as const },
          { href: '/inventory/audits', label: 'Tomas Físicas & Mermas', icon: 'package' as const },
          { href: '/conflicts', label: 'Inconsistencias POS', icon: 'alert' as const },
        ].filter(({ href }) => canOpen(ctx.actor, href)),
      },
    },
    {
      type: 'group' as const,
      group: {
        id: 'compras',
        label: 'Compras',
        icon: 'truck' as const,
        items: [
          { href: '/purchases', label: 'Facturas de Compra', icon: 'truck' as const },
          { href: '/purchases/suppliers', label: 'Proveedores', icon: 'building' as const },
        ].filter(({ href }) => canOpen(ctx.actor, href)),
      },
    },
    {
      type: 'group' as const,
      group: {
        id: 'admin',
        label: 'Gestión',
        icon: 'settings' as const,
        items: [
          { href: '/reports', label: t('nav.reports'), icon: 'chart' as const },
          { href: '/settings', label: t('nav.settings'), icon: 'settings' as const },
        ].filter(({ href }) => canOpen(ctx.actor, href)),
      },
    },
  ].filter((entry: SidebarNavItem) => {
    if (entry.type === 'link') return canOpen(ctx.actor, entry.item.href);
    return entry.group.items.length > 0;
  });

  return (
    <div className="min-h-screen overflow-x-clip lg:flex">
      {/*
       * Help lives in the FRAME rather than on each screen, like the "done" toast: it
       * belongs to the system, not to a list. Being here also keeps it out of (auth) and
       * the print screen, which do not mount the frame.
       */}
      <AssistantPanel isDemo={session.isDemo} />

      <aside
        data-surface="nav"
        className="hidden border-r border-nav-line bg-nav lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-auto lg:shrink-0 lg:flex-col"
      >
        <div className="min-h-0 flex-1">
          <SidebarNav items={sidebarItems} appName={t('app.name')} />
        </div>

        <div className="mt-auto border-t border-nav-line/70 p-2.5">
          <a
            href={getPosTerminalUrl()}
            target="_blank"
            rel="noopener noreferrer"
            title="Terminal POS PWA"
            className="flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand px-2.5 py-2.5 text-xs font-semibold text-brand-ink shadow-xs transition hover:bg-brand-hover"
          >
            <ShoppingCart className="size-4 shrink-0" />
            <span className="truncate">POS</span>
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-surface="nav"
          className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 border-b border-nav-line/80 bg-nav/90 px-6 backdrop-blur-md lg:flex"
        >
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-ink">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {ctx.settings.fiscalCountry === 'VE' ? 'Venezuela · SENIAT' : 'EE. UU. · US GAAP'}
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-pill bg-subtle px-2.5 py-1 font-mono text-[11px] text-muted">
              Fiscal: {ctx.settings.fiscalCountry === 'VE' ? 'VES' : 'USD'} · Precios:{' '}
              {ctx.settings.baseCurrency}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {can(ctx.actor, 'invoice:write') && (
              <Link
                href="/invoicing/new"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-xs transition hover:bg-brand-hover"
              >
                + Factura Venta
              </Link>
            )}
            {can(ctx.actor, 'purchase:receive') && (
              <Link
                href="/purchases/new"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-subtle"
              >
                + Factura Compra
              </Link>
            )}

            {session.memberships.length > 0 && (
              <form action={switchTenantAction} className="flex items-center gap-1.5">
                <label htmlFor="navbar-tenantId" className="sr-only">
                  {t('auth.switchBusiness')}
                </label>
                <select
                  id="navbar-tenantId"
                  name="tenantId"
                  defaultValue={ctx.tenantId}
                  aria-label="Cambiar de empresa"
                  className="h-8 max-w-[190px] rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                >
                  {session.memberships.map((m) => (
                    <option key={m.tenantId} value={m.tenantId}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {session.memberships.length > 1 && (
                  <button
                    type="submit"
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                  >
                    {t('common.change')}
                  </button>
                )}
              </form>
            )}

            <NavDetails className="relative">
              <summary
                aria-label="Usuario y cuenta"
                className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink transition hover:bg-subtle [&::-webkit-details-marker]:hidden"
              >
                <span className="grid size-5 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                  {session.email !== null ? (
                    session.email.charAt(0).toUpperCase()
                  ) : (
                    <UserRound aria-hidden="true" className="size-3" />
                  )}
                </span>
                <span className="max-w-[140px] truncate">{session.email ?? 'Usuario'}</span>
              </summary>
              <div className="absolute top-[calc(100%+0.5rem)] right-0 z-40 w-64 rounded-card border border-line bg-surface p-4 shadow-lg">
                <AccountArea session={session} activeTenantId={ctx.tenantId} />
              </div>
            </NavDetails>
          </div>
        </header>

        <header
          data-surface="nav"
          className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-nav-line bg-nav/95 px-4 backdrop-blur-md lg:hidden"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <MobileMenuDrawer
              items={sidebarItems}
              appName={t('app.name')}
              posUrl={getPosTerminalUrl()}
              fiscalLabel={
                ctx.settings.fiscalCountry === 'VE' ? 'Venezuela · SENIAT' : 'EE. UU. · US GAAP'
              }
            />
            <Link href="/" className="min-w-0 truncate rounded-control">
              <Logo name={t('app.name')} />
            </Link>
          </div>

          <NavDetails className="relative shrink-0">
            <summary
              aria-label={t('nav.account')}
              className="grid size-9 cursor-pointer list-none place-items-center rounded-pill bg-brand-soft text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden"
            >
              {session.email !== null ? (
                session.email.charAt(0).toUpperCase()
              ) : (
                <UserRound aria-hidden="true" className="size-4" strokeWidth={2} />
              )}
            </summary>
            <div className="absolute top-[calc(100%+0.5rem)] right-0 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-4 shadow-lg">
              <AccountArea session={session} activeTenantId={ctx.tenantId} />
            </div>
          </NavDetails>
        </header>

        {session.isDemo && <DemoNotice session={session} />}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-8 sm:px-6 lg:px-10 lg:pt-10">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:px-10">
          <p className="border-t border-line pt-5 text-xs text-muted">{t('legal.notice')}</p>
        </footer>
      </div>
    </div>
  );
}

interface ScreenProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: React.ReactNode;
  /** The way back, rendered ABOVE the title instead of squeezed among the actions. */
  readonly back?: { readonly href: string; readonly label: string };
  /**
   * Aviso flotante de "listo", si la pantalla llega despues de crear algo.
   *
   * Cada pantalla decide QUE dice —el texto depende de si se creo un cliente o una nota— y
   * el aviso decide como se ve: encima de todo, se va solo y no ocupa sitio en el contenido.
   */
  readonly toast?: string;
  readonly children: React.ReactNode;
}

/**
 * What changes from one screen to the next: title, actions, the way back, the notice, and
 * the content under them. It renders inside the frame's `<main>`, in the same order the
 * frame used to render it, so the document reads exactly as before.
 */
export function Screen({ title, subtitle, action, back, toast, children }: ScreenProps) {
  return (
    <>
      {toast !== undefined && <Toast message={toast} />}

      {back !== undefined && (
        <div className="mb-3">
          <BackLink href={back.href}>{back.label}</BackLink>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px] sm:leading-tight">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {action !== undefined && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>

      {children}
    </>
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
 */
async function AccountArea({
  session,
  activeTenantId,
}: {
  session: SessionInfo;
  activeTenantId: string;
}) {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-3">
      {session.email !== null && (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-soft text-xs font-semibold text-brand"
          >
            {session.email.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm text-ink-soft" title={session.email}>
            {session.email}
          </span>
        </div>
      )}

      {session.memberships.length > 1 && (
        <form action={switchTenantAction} className="flex items-center gap-2">
          <label htmlFor="tenantId" className="sr-only">
            {t('auth.switchBusiness')}
          </label>
          <select
            id="tenantId"
            name="tenantId"
            defaultValue={activeTenantId}
            className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 text-sm"
          >
            {session.memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t('common.change')}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        <ThemeToggle />

        {/* En una demostracion, "crear mi cuenta" va JUNTO a "salir", no en su
            lugar. Quien esta probando el sistema tiene una sesion de verdad que
            puede querer cerrar, y a la vez es la unica persona a la que tiene
            sentido ofrecerle empezar con su propio negocio. */}
        {session.isDemo && signupConfig.enabled() && (
          <Link href="/signup" className={buttonClasses({ size: 'sm', block: true })}>
            {t('demo.createAccount')}
          </Link>
        )}

        {/* Sin correo no hay sesion que cerrar: es el driver de pruebas, que no
            tiene autenticacion. Ofrecer "salir" ahi seria un boton que no hace nada. */}
        {session.email !== null && (
          <form action={signOutAction}>
            <button
              type="submit"
              className={buttonClasses({ variant: 'secondary', size: 'sm', block: true })}
            >
              {t('auth.signOut')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * El aviso de que esto es temporal.
 *
 * Va en TODAS las pantallas y no solo en la puerta de entrada. Quien lleva media
 * hora dando de alta productos ya no se acuerda de lo que leyo antes de entrar, y
 * enterarse de que se borra todo DESPUES de haberlo perdido es la peor forma
 * posible de contarlo.
 *
 * Dice las horas que quedan y no la fecha exacta a proposito: el servidor corre
 * en UTC y el visitante no, asi que una hora absoluta seria una hora equivocada
 * para casi todo el mundo. "Quedan 19 horas" es cierto en cualquier huso.
 */
async function DemoNotice({ session }: { session: SessionInfo }) {
  const t = await getTranslations();

  if (session.expiresAt === null) {
    // El comercio de ejemplo. No caduca porque es la plantilla que se clona para
    // cada visitante.
    return <Banner>{t('demo.templateNotice')}</Banner>;
  }

  const hours = Math.ceil((session.expiresAt.getTime() - Date.now()) / 3_600_000);

  return (
    <Banner>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span>{hours <= 1 ? t('demo.sessionNoticeSoon') : t('demo.sessionNotice', { hours })}</span>
        <DestroyDemoButton />
      </div>
    </Banner>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs font-medium text-warn-ink"
    >
      {children}
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <Link href={href} className={buttonClasses({ className })}>
      {children}
    </Link>
  );
}

/**
 * Contenedor de tabla con scroll propio: la pagina nunca desborda en movil.
 * The row hover lives here, once, instead of in each list page's `<tr>`.
 */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-brand-soft/40">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

/** An empty state that says what is missing and, when there is one, the way to add it. */
export function Empty({
  children,
  icon: Icon = Inbox,
  action,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-pill bg-brand-soft text-brand">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <div className="mt-3 max-w-sm text-sm text-muted">{children}</div>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
