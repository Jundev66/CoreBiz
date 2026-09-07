import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell, QuotaBar, PrimaryLink, TableFrame, Empty } from '@/ui/shell';

/**
 * Listado de clientes.
 *
 * Es un Server Component: los datos se resuelven en el servidor y al navegador solo
 * llega HTML. No hay estado de cliente, ni fetch, ni spinner. El lado de LECTURA no
 * pasa por los casos de uso ni rehidrata agregados — consulta directamente y devuelve
 * datos planos (CQRS ligero). Escribir si pasa siempre por un caso de uso.
 */
export default async function CustomersPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await forRequest();

  const page = await queries.customers.list({ limit: 25 });
  const quota = ctx.plan.quota('customers', await queries.usage.current('customers'));

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('customers.title')}
      subtitle={t('customers.subtitle')}
      action={
        <div className="flex items-end gap-6">
          {/* La cuota se muestra siempre, no solo al agotarse: enterarse del
              limite justo cuando te bloquea es la peor forma de descubrirlo. */}
          <QuotaBar
            current={quota.current}
            limit={quota.limit}
            label={t('quota.usage', {
              current: quota.current,
              limit: quota.limit,
              resource: t('customers.title').toLowerCase(),
            })}
            nearLimitLabel={t('quota.nearLimit')}
          />
          <PrimaryLink href="/customers/new">{t('customers.new')}</PrimaryLink>
        </div>
      }
    >
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
            </tr>
          </thead>
          <tbody>
            {page.items.map((customer) => (
              <tr key={customer.id} className="border-b border-[var(--color-line)] last:border-0">
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
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Shell>
  );
}
