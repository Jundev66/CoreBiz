import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { SettingsNav } from '@/ui/settings-nav';

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
  const { ctx, session, queries } = await apiForRequest();

  const params = await searchParams;
  const canRead = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  const [page, actions] = canRead
    ? await Promise.all([
        queries.admin.auditLog({
          ...(params.action !== undefined && params.action !== '' ? { action: params.action } : {}),
          ...(params.from !== undefined && params.from !== ''
            ? { from: new Date(params.from) }
            : {}),
          // Hasta el FINAL del dia elegido. Sin esto, filtrar "hasta hoy" no
          // devuelve nada de hoy, que es lo que casi siempre se busca.
          ...(params.to !== undefined && params.to !== ''
            ? { to: new Date(`${params.to}T23:59:59.999Z`) }
            : {}),
          limit: 100,
        }),
        queries.admin.auditActions(),
      ])
    : [{ items: [], nextCursor: null }, []];

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
    >
      <SettingsNav current="audit" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">{t('settings.audit.heading')}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {t('settings.audit.description')}
          </p>
        </div>

        <a
          href={`/api/audit/export?${exportQuery(params)}`}
          className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium"
        >
          {t('settings.audit.export')}
        </a>
      </div>

      {!canRead ? (
        <Empty>{t('settings.audit.notAllowed')}</Empty>
      ) : (
        <>
          {/* GET y no una Server Action: los filtros pertenecen a la URL, para
              que un enlace a "todo lo que hizo tal persona en marzo" se pueda
              compartir y guardar. */}
          <form method="get" className="mb-6 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="action" className="block text-sm font-medium">
                {t('settings.audit.action')}
              </label>
              <select
                id="action"
                name="action"
                defaultValue={params.action ?? ''}
                className="mt-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <option value="">{t('settings.audit.allActions')}</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <DateField name="from" label={t('settings.audit.from')} value={params.from} />
            <DateField name="to" label={t('settings.audit.to')} value={params.to} />

            <button
              type="submit"
              className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
            >
              {t('settings.audit.filter')}
            </button>

            {(params.action ?? params.from ?? params.to) !== undefined && (
              <Link href="/settings/audit" className="text-sm underline underline-offset-4">
                {t('settings.audit.clear')}
              </Link>
            )}
          </form>

          {page.items.length === 0 ? (
            <Empty>{t('settings.audit.empty')}</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.audit.when')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.audit.who')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.audit.action')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('settings.audit.detail')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-muted)]">
                      {format.dateTime(entry.occurredAt, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">{entry.actorEmail ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {entry.summary === null ? '—' : summarize(entry.summary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </>
      )}
    </Shell>
  );
}

/**
 * Los mismos filtros que muestra la tabla, en la URL de descarga.
 *
 * Se arrastran a proposito: exportar tiene que dar exactamente lo que se esta
 * viendo. Un boton que descarga el historico entero cuando en pantalla hay tres
 * filas filtradas es una sorpresa desagradable a mitad de una auditoria.
 */
function exportQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value);
  }
  return query.toString();
}

/** "clave: valor · clave: valor". Suficiente para reconocer que paso. */
function summarize(summary: Readonly<Record<string, unknown>>): string {
  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function DateField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string | undefined;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        defaultValue={value ?? ''}
        className="mt-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
    </div>
  );
}
