import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Archive, ArrowLeft, Plus, UsersRound } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

/**
 * Listado de clientes.
 *
 * Es un Server Component: los datos se resuelven en el servidor y al navegador solo
 * llega HTML. No hay estado de cliente, ni fetch, ni spinner. El lado de LECTURA no
 * pasa por los casos de uso ni rehidrata agregados — consulta directamente y devuelve
 * datos planos (CQRS ligero). Escribir si pasa siempre por un caso de uso.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; creado?: string }>;
}) {
  const t = await getTranslations();
  const { archivados, creado } = await searchParams;
  const createdCode = noticeCode(creado);
  const includeArchived = archivados === '1';
  const { ctx, data: page } = await withSession((queries) =>
    queries.customers.list({ limit: 25, includeArchived }),
  );

  /*
   * The session and the list travel together; the role still decides what is shown. Without
   * `customer:read` the API answers 403, which arrives as `null`, and the screen says so
   * instead of letting the refusal take it down. See `@/ui/no-access`.
   */
  if (!can(ctx.actor, 'customer:read') || page === null) {
    return (
      <Screen title={t('customers.title')}>
        <NoAccess />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('customers.title')}
      subtitle={t('customers.subtitle')}
      {...(createdCode !== null ? { toast: t('customers.created', { code: createdCode }) } : {})}
      action={
        <PrimaryLink href="/customers/new">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          {t('customers.new')}
        </PrimaryLink>
      }
    >
      <div className="space-y-4">
        {/* Los archivados no se esconden del todo: se ven pidiendolo. Ocultarlos sin
            forma de llegar a ellos convierte "archivar" en "perder". */}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={includeArchived ? '/customers' : '/customers?archivados=1'}
            variant="secondary"
            size="sm"
          >
            {includeArchived ? (
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
            ) : (
              <Archive aria-hidden="true" className="size-4" strokeWidth={1.75} />
            )}
            {includeArchived ? t('common.back') : t('customers.showArchived')}
          </ButtonLink>
        </div>

        {page.items.length === 0 ? (
          <Empty
            icon={UsersRound}
            action={
              <ButtonLink href="/customers/new" size="sm">
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('customers.new')}
              </ButtonLink>
            }
          >
            {t('customers.empty')}
          </Empty>
        ) : (
          <>
            <DesktopOnly>
              <TableFrame>
                <thead>
                  <tr className="border-b border-line bg-subtle/60">
                    <th scope="col" className={TH}>
                      {t('customers.code')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('customers.name')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('customers.taxId')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('customers.creditLimit')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">{t('common.view')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((customer) => (
                    <tr
                      key={customer.id}
                      className={`border-b border-line transition-colors last:border-0 hover:bg-subtle/40 ${customer.archived ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">{customer.code}</td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {customer.name}
                        {customer.archived && (
                          <span className="ml-2">
                            <Badge>{t('status.archived')}</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{customer.taxId ?? '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {customer.creditLimit ? (
                          `$ ${customer.creditLimit}`
                        ) : (
                          <span className="text-muted">{t('customers.noCreditLimit')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                        >
                          {t('common.view')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </DesktopOnly>

            <MobileList>
              {page.items.map((customer) => (
                <MobileListItem
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  title={customer.name}
                  subtitle={
                    <span className="font-mono text-xs">
                      {customer.code}
                      {customer.taxId !== null && ` · ${customer.taxId}`}
                    </span>
                  }
                  {...(customer.creditLimit ? { trailing: `$ ${customer.creditLimit}` } : {})}
                  {...(customer.archived
                    ? { trailingHint: <Badge>{t('status.archived')}</Badge>, muted: true }
                    : {})}
                />
              ))}
            </MobileList>
          </>
        )}
      </div>
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
