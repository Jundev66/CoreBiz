import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import {
  Users,
  Package,
  FileText,
  Truck,
  BarChart3,
  Settings,
  LayoutDashboard,
} from 'lucide-react';
import { signupConfig } from '@/demo/sandbox';
import { Toast } from '@/ui/toast';
import type { TenantContext } from '@corebiz/application';
import { signOutAction, switchTenantAction } from '@/actions/auth';
import type { SessionInfo } from '@/api/session';

/**
 * Marco comun de las pantallas de la aplicacion.
 *
 * Es un Server Component: la navegacion y el aviso legal se resuelven en el servidor y
 * al navegador no llega ni una linea de JavaScript por esto.
 *
 * La estructura es de HERRAMIENTA y no de sitio web: modulos fijos a la izquierda,
 * contenido a la derecha. Antes era una barra horizontal de enlaces de texto, que es la
 * forma de un menu de navegacion y no la de un sistema de gestion — y esa diferencia se
 * nota antes de leer una sola palabra.
 *
 * En pantallas estrechas la columna pasa a ser una tira horizontal desplazable. No hay
 * menu desplegable a proposito: exigiria estado de cliente para algo que se resuelve
 * con scroll, y dejaria de funcionar exactamente cuando mas falta hace.
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
  /**
   * Aviso flotante de "listo", si la pantalla llega despues de crear algo.
   *
   * Vive en el marco y no en cada pantalla porque el aviso es del SISTEMA, no del
   * listado: aparece encima de todo, se va solo y no ocupa sitio en el contenido. Cada
   * pantalla decide QUE dice —el texto depende de si se creo un cliente o una nota— y
   * el marco decide como se ve.
   */
  readonly toast?: string;
}

export async function Shell({
  ctx,
  session,
  title,
  subtitle,
  action,
  toast,
  children,
}: ShellProps) {
  const t = await getTranslations();

  /*
   * La ruta actual, para marcar el modulo en el que se esta.
   *
   * Un Server Component no conoce el pathname, pero el middleware ya lo deja en una
   * cabecera de peticion para la pantalla de espera. Reutilizarla evita convertir toda
   * la navegacion en un componente de cliente solo para pintar un estado activo.
   */
  const rutaActual = ((await headers()).get('x-corebiz-path') ?? '').split('?')[0] ?? '';

  /*
   * El menu ensena lo que el sistema HACE, y nada mas.
   *
   * Antes llevaba «Presupuestos» y «Cobros» marcados como en desarrollo, con el
   * argumento de que un hueco declarado se juzga mejor que un hueco a secas. Con el
   * alcance recortado el argumento se da la vuelta: dos entradas que no llevan a nada
   * en un menu de seis hacen que el sistema parezca un tercio vacio. Lo que se ensena
   * es el ciclo completo —comprar, tener existencias, vender— y ese esta entero.
   */
  const nav = [
    { href: '/', label: t('nav.home'), Icon: LayoutDashboard, exacto: true },
    { href: '/customers', label: t('nav.customers'), Icon: Users },
    { href: '/products', label: t('nav.products'), Icon: Package },
    { href: '/delivery-notes', label: t('nav.deliveryNotes'), Icon: FileText },
    { href: '/purchases', label: t('nav.purchases'), Icon: Truck },
    { href: '/reports', label: t('nav.reports'), Icon: BarChart3 },
    { href: '/settings', label: t('nav.settings'), Icon: Settings },
  ];

  const estaAqui = (href: string, exacto?: boolean): boolean =>
    exacto === true
      ? rutaActual === href
      : rutaActual === href || rutaActual.startsWith(href + '/');

  return (
    <div className="min-h-screen lg:flex">
      {toast !== undefined && <Toast message={toast} />}

      <aside className="border-b border-[var(--color-line)] bg-[var(--color-surface)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="px-5 py-4 lg:px-6 lg:py-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            {t('app.name')}
          </Link>
        </div>

        <nav
          aria-label={t('app.name')}
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {nav.map(({ href, label, Icon, exacto }) => {
            const aqui = estaAqui(href, exacto);
            return (
              <Link
                key={href}
                href={href}
                {...(aqui ? { 'aria-current': 'page' as const } : {})}
                className={[
                  'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition',
                  aqui
                    ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                    : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)]',
                ].join(' ')}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        {session && (
          <div className="mt-auto hidden border-t border-[var(--color-line)] px-3 py-4 lg:block">
            <AccountArea session={session} activeTenantId={ctx.tenantId} />
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {session?.isDemo === true && <DemoNotice session={session} />}

        {session && (
          <div className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-3 lg:hidden">
            <AccountArea session={session} activeTenantId={ctx.tenantId} />
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
            </div>
            {action}
          </div>

          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-5 pb-8 lg:px-10">
          <p className="border-t border-[var(--color-line)] pt-5 text-xs text-[var(--color-muted)]">
            {t('legal.notice')}
          </p>
        </footer>
      </div>
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
    <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
      {session.memberships.length > 1 && (
        <form action={switchTenantAction}>
          <label htmlFor="tenantId" className="sr-only">
            {t('auth.switchBusiness')}
          </label>
          <select
            id="tenantId"
            name="tenantId"
            defaultValue={activeTenantId}
            className="w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
          >
            {session.memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="submit" className="mt-1 text-xs underline underline-offset-4">
            {t('common.change')}
          </button>
        </form>
      )}

      {session.email !== null && (
        <span className="truncate text-xs text-[var(--color-muted)]" title={session.email}>
          {session.email}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* En una demostracion, "crear mi cuenta" va JUNTO a "salir", no en su
            lugar. Quien esta probando el sistema tiene una sesion de verdad que
            puede querer cerrar, y a la vez es la unica persona a la que tiene
            sentido ofrecerle empezar con su propio negocio. */}
        {session.isDemo && signupConfig.enabled() && (
          <Link
            href="/signup"
            className="rounded-[var(--radius-control)] border border-[var(--color-brand)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-brand)] transition hover:bg-[var(--color-brand-soft)]"
          >
            {t('demo.createAccount')}
          </Link>
        )}

        {/* Sin correo no hay sesion que cerrar: es el driver de pruebas, que no
            tiene autenticacion. Ofrecer "salir" ahi seria un boton que no hace nada. */}
        {session.email !== null && (
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-[var(--radius-control)] border border-[var(--color-line)] px-2.5 py-1.5 text-xs transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-subtle)]"
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
    // cada visitante. Antes habia aqui una rama para el driver en memoria que
    // anunciaba "corriendo sin base de datos"; ese modo ya no es una forma de usar
    // el producto, asi que el producto ha dejado de hablar de el.
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
      className="border-b border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-5 py-2 text-center text-xs text-[var(--color-warn-ink)]"
    >
      {children}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-3.5 py-2 text-sm font-medium text-[var(--color-brand-ink)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--color-brand-hover)]"
    >
      {children}
    </Link>
  );
}

/** Contenedor de tabla con scroll propio: la pagina nunca desborda en movil. */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-6 py-14 text-center text-sm text-[var(--color-muted)]">
      {children}
    </p>
  );
}
