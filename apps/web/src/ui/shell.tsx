import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Users,
  Package,
  FileText,
  Truck,
  BarChart3,
  Settings,
  LayoutDashboard,
  MoreHorizontal,
  Inbox,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { signupConfig } from '@/demo/sandbox';
import { canOpen } from '@/auth/module-access';
import { Toast } from '@/ui/toast';
import { AssistantPanel } from '@/ui/assistant-panel';
import type { TenantContext } from '@corebiz/application';
import { signOutAction, switchTenantAction } from '@/actions/auth';
import type { SessionInfo } from '@/api/session';
import { buttonClasses } from '@/ui/button';
import { Logo } from '@/ui/logo';
import { BackLink } from '@/ui/primitives';
import { MoreSummary, NavDetails, NavLink } from '@/ui/nav-link';

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

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly exact?: boolean;
  /** Shorter label for the phone tab bar, where "Delivery notes" does not fit. */
  readonly short?: string;
}

/** How many modules fit in the phone tab bar before the rest move under "More". */
const TAB_BAR_SLOTS = 5;

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
  const nav: NavItem[] = [
    { href: '/', label: t('nav.home'), Icon: LayoutDashboard, exact: true },
    { href: '/customers', label: t('nav.customers'), Icon: Users },
    { href: '/products', label: t('nav.products'), Icon: Package },
    {
      href: '/delivery-notes',
      label: t('nav.deliveryNotes'),
      short: t('nav.deliveryNotesShort'),
      Icon: FileText,
    },
    { href: '/purchases', label: t('nav.purchases'), Icon: Truck },
    { href: '/reports', label: t('nav.reports'), Icon: BarChart3 },
    { href: '/settings', label: t('nav.settings'), Icon: Settings },
  ].filter(({ href }) => canOpen(ctx.actor, href));

  const tabItems = nav.length <= TAB_BAR_SLOTS ? nav : nav.slice(0, TAB_BAR_SLOTS - 1);
  const moreItems = nav.length <= TAB_BAR_SLOTS ? [] : nav.slice(TAB_BAR_SLOTS - 1);

  return (
    <div className="min-h-screen lg:flex">
      {/*
       * Help lives in the FRAME rather than on each screen, like the "done" toast: it
       * belongs to the system, not to a list. Being here also keeps it out of (auth) and
       * the print screen, which do not mount the frame.
       */}
      <AssistantPanel />

      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="rounded-control">
            <Logo name={t('app.name')} />
          </Link>
        </div>

        <nav aria-label={t('app.name')} className="flex flex-col gap-0.5 px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              {...(item.exact === true ? { exact: true } : {})}
              hint="inline"
              className="flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors"
              activeClassName="bg-brand-soft font-medium text-brand"
              idleClassName="text-ink-soft hover:bg-subtle hover:text-ink"
            >
              <item.Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <AccountArea session={session} activeTenantId={ctx.tenantId} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
          <Link href="/" className="rounded-control">
            <Logo name={t('app.name')} />
          </Link>

          <NavDetails className="relative">
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

        <footer className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-10 lg:pb-8">
          <p className="border-t border-line pt-5 text-xs text-muted">{t('legal.notice')}</p>
        </footer>

        <nav
          aria-label={t('nav.mobile')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="mx-auto flex h-16 max-w-lg items-stretch">
            {tabItems.map((item) => (
              <li key={item.href} className="flex-1">
                <NavLink
                  href={item.href}
                  {...(item.exact === true ? { exact: true } : {})}
                  hint="top"
                  className="relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors [&[aria-current=page]>svg]:[stroke-width:2.25]"
                  activeClassName="text-brand"
                  idleClassName="text-muted active:text-ink"
                >
                  <item.Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
                </NavLink>
              </li>
            ))}

            {moreItems.length > 0 && (
              <li className="flex-1">
                <NavDetails className="relative h-full">
                  <MoreSummary
                    hrefs={moreItems.map((item) => item.href)}
                    className="flex h-full cursor-pointer list-none flex-col items-center justify-center gap-1 text-[11px] font-medium [&::-webkit-details-marker]:hidden"
                    activeClassName="text-brand"
                    idleClassName="text-muted"
                  >
                    <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} />
                    <span>{t('nav.more')}</span>
                  </MoreSummary>
                  <div className="absolute right-2 bottom-[calc(100%+0.5rem)] w-56 rounded-card border border-line bg-surface p-1.5 shadow-lg">
                    {moreItems.map((item) => (
                      <NavLink
                        key={item.href}
                        href={item.href}
                        hint="inline"
                        className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm"
                        activeClassName="bg-brand-soft font-medium text-brand"
                        idleClassName="text-ink active:bg-subtle"
                      >
                        <item.Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </NavDetails>
              </li>
            )}
          </ul>
        </nav>
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
    <Banner>{hours <= 1 ? t('demo.sessionNoticeSoon') : t('demo.sessionNotice', { hours })}</Banner>
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

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClasses()}>
      {children}
    </Link>
  );
}

/** Contenedor de tabla con scroll propio: la pagina nunca desborda en movil. */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-xs">
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
      <span className="grid size-11 place-items-center rounded-pill bg-subtle text-muted">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3 max-w-sm text-sm text-muted">{children}</p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
