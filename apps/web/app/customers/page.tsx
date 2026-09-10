import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, PrimaryLink, TableFrame, Empty } from '@/ui/shell';

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
  const { ctx, session, queries } = await apiForRequest();

  const includeArchived = archivados === '1';
  const page = await queries.customers.list({ limit: 25, includeArchived });

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('customers.title')}
      subtitle={t('customers.subtitle')}
      {...(creado !== undefined ? { toast: t('customers.created', { code: creado }) } : {})}
      action={
        <div className="flex items-end gap-6">
          <PrimaryLink href="/customers/new">{t('customers.new')}</PrimaryLink>
        </div>
      }
    >
      {/* Los archivados no se esconden del todo: se ven pidiendolo. Ocultarlos sin
          forma de llegar a ellos convierte "archivar" en "perder". */}
      <p className="mb-4 text-sm">
        <Link
          href={includeArchived ? '/customers' : '/customers?archivados=1'}
          className="underline underline-offset-4 text-[var(--color-muted)]"
        >
          {includeArchived ? t('common.back') : t('customers.showArchived')}
        </Link>
      </p>

      {page.items.length === 0 ? (
        <Empty>{t('customers.empty')}</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('customers.code')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('customers.name')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('customers.taxId')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('customers.creditLimit')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{t('common.view')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((customer) => (
              <tr
                key={customer.id}
                className={
                  customer.archived
                    ? 'border-b border-[var(--color-line)] opacity-60 last:border-0'
                    : 'border-b border-[var(--color-line)] last:border-0'
                }
              >
                <td className="px-4 py-3 font-mono text-xs">{customer.code}</td>
                <td className="px-4 py-3 font-medium">{customer.name}</td>
                <td className="px-4 py-3 text-[var(--color-muted)]">{customer.taxId ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {customer.creditLimit ? (
                    `$ ${customer.creditLimit}`
                  ) : (
                    <span className="text-[var(--color-muted)]">
                      {t('customers.noCreditLimit')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-sm underline underline-offset-4"
                  >
                    {t('common.view')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Shell>
  );
}
