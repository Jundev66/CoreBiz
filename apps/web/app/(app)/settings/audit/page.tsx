import type { Metadata } from 'next';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Download, History, Lock } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Button, ButtonLink, buttonClasses } from '@/ui/button';
import { DesktopOnly, MobileList } from '@/ui/list';
import { SettingsNav } from '@/ui/settings-nav';
import { dayParam, textParam } from '@/ui/filter-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('settings.tabs.audit') };
}

/**
 * Visor del registro de auditoria.
 *
 * Quien puede leerlo NO lo decide esta pantalla: lo decide la politica RLS de
 * `audit_log`, que exige `app.is_admin()`. Un vendedor que escriba la URL a mano
 * recibe cero filas de la base de datos. El aviso de abajo es cortesia para que
 * entienda por que ve la tabla vacia, no la medida que le impide verla.
 *
 * La exportacion a CSV va por su propia ruta, que vuelve a comprobar quien pide el
 * archivo en lugar de fiarse de que el enlace solo se pinte para quien puede: ocultar
 * un boton no es un limite.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from?: string; to?: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  /*
   * Filters are sanitised BEFORE use, and not out of zeal: they are untrusted input that
   * ends in `.toISOString()` three layers down. An impossible date is dropped instead of
   * breaking the screen — see `@/ui/filter-params`.
   */
  const rawParams = await searchParams;
  const filters = {
    action: textParam(rawParams.action),
    from: dayParam(rawParams.from),
    to: dayParam(rawParams.to),
  };

  // The log leaves together with the session. Anyone but owner and admin gets a 403 from the
  // API, which arrives as `null`: the screen explains it instead of breaking.
  const { ctx, data } = await withSession((queries) =>
    Promise.all([
      queries.admin.auditLog({
        ...(filters.action !== null ? { action: filters.action } : {}),
        ...(filters.from !== null ? { from: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        // Hasta el FINAL del dia elegido. Sin esto, filtrar "hasta hoy" no
        // devuelve nada de hoy, que es lo que casi siempre se busca.
        ...(filters.to !== null ? { to: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
        limit: 100,
      }),
      queries.admin.auditActions(),
    ]),
  );

  const canRead = (ctx.actor.role === 'owner' || ctx.actor.role === 'admin') && data !== null;

  const [page, actions] = canRead && data !== null ? data : [{ items: [], nextCursor: null }, []];

  const when = (occurredAt: Date): string =>
    format.dateTime(occurredAt, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <SettingsNav current="audit" actor={ctx.actor} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{t('settings.audit.heading')}</h2>
            <p className="mt-1 text-sm text-muted">{t('settings.audit.description')}</p>
          </div>

          {/* A plain anchor, not a client-side Link: it is a file download from an API route. */}
          <a
            href={`/api/audit/export?${exportQuery(filters)}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'self-start' })}
          >
            <Download aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('settings.audit.export')}
          </a>
        </div>

        {!canRead ? (
          <Empty icon={Lock}>{t('settings.audit.notAllowed')}</Empty>
        ) : (
          <>
            {/* GET y no una Server Action: los filtros pertenecen a la URL, para
                que un enlace a "todo lo que hizo tal persona en marzo" se pueda
                compartir y guardar. */}
            <form
              method="get"
              className="grid grid-cols-2 gap-3 rounded-card border border-line bg-surface p-4 shadow-xs sm:flex sm:flex-wrap sm:items-end sm:gap-4"
            >
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="action" className="block text-sm font-medium text-ink">
                  {t('settings.audit.action')}
                </label>
                <select
                  id="action"
                  name="action"
                  defaultValue={filters.action ?? ''}
                  className={`${CONTROL} sm:min-w-48`}
                >
                  <option value="">{t('settings.audit.allActions')}</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>

              <DateField name="from" label={t('settings.audit.from')} value={filters.from} />
              <DateField name="to" label={t('settings.audit.to')} value={filters.to} />

              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <Button type="submit">{t('settings.audit.filter')}</Button>

                {(filters.action ?? filters.from ?? filters.to) !== null && (
                  <ButtonLink href="/settings/audit" variant="ghost">
                    {t('settings.audit.clear')}
                  </ButtonLink>
                )}
              </div>
            </form>

            {page.items.length === 0 ? (
              <Empty icon={History}>{t('settings.audit.empty')}</Empty>
            ) : (
              <>
                <DesktopOnly>
                  <TableFrame>
                    <thead>
                      <tr className="border-b border-line bg-subtle/60">
                        <th scope="col" className={TH}>
                          {t('settings.audit.when')}
                        </th>
                        <th scope="col" className={TH}>
                          {t('settings.audit.who')}
                        </th>
                        <th scope="col" className={TH}>
                          {t('settings.audit.action')}
                        </th>
                        <th scope="col" className={TH}>
                          {t('settings.audit.detail')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-line align-top transition-colors last:border-0 hover:bg-subtle/40"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">
                            {when(entry.occurredAt)}
                          </td>
                          <td className="px-4 py-3 text-ink-soft">{entry.actorEmail ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-ink">
                            {entry.action}
                          </td>
                          <td className="px-4 py-3 break-words text-muted">
                            {entry.summary === null ? '—' : summarize(entry.summary)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableFrame>
                </DesktopOnly>

                <MobileList>
                  {page.items.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate font-mono text-xs font-medium text-ink">
                          {entry.action}
                        </p>
                        <p className="shrink-0 text-xs text-muted tabular-nums">
                          {when(entry.occurredAt)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[13px] text-ink-soft">
                        {entry.actorEmail ?? '—'}
                      </p>
                      {entry.summary !== null && (
                        <p className="mt-1 text-[13px] break-words text-muted">
                          {summarize(entry.summary)}
                        </p>
                      )}
                    </li>
                  ))}
                </MobileList>
              </>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';

const CONTROL =
  'mt-1.5 h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink shadow-xs transition-colors focus:border-brand';

/**
 * Los mismos filtros que muestra la tabla, en la URL de descarga.
 *
 * Se arrastran a proposito: exportar tiene que dar exactamente lo que se esta
 * viendo. Un boton que descarga el historico entero cuando en pantalla hay tres
 * filas filtradas es una sorpresa desagradable a mitad de una auditoria.
 */
function exportQuery(params: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== '') query.set(key, value);
  }
  return query.toString();
}

/** "clave: valor · clave: valor". Suficiente para reconocer que paso. */
function summarize(summary: Readonly<Record<string, unknown>>): string {
  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function DateField({ name, label, value }: { name: string; label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        defaultValue={value ?? ''}
        className={`${CONTROL} sm:w-auto`}
      />
    </div>
  );
}
