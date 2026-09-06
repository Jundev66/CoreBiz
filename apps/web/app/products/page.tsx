import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { memoryQueries } from '@/composition/memory-driver';
import { Shell, QuotaBar, PrimaryLink, TableFrame, Empty } from '@/ui/shell';

export default async function ProductsPage() {
  const t = await getTranslations();
  const { ctx } = await forRequest();

  const queries = memoryQueries(ctx.tenantId);
  const page = await queries.products.list({ limit: 50 });
  const quota = ctx.plan.quota('products', queries.usage('products'));

  const belowMinimum = page.items.filter((p) => p.isBelowMinimum);

  return (
    <Shell
      ctx={ctx}
      title={t('products.title')}
      subtitle={t('products.subtitle')}
      action={
        <div className="flex items-end gap-6">
          <QuotaBar
            current={quota.current}
            limit={quota.limit}
            label={t('quota.usage', {
              current: quota.current,
              limit: quota.limit,
              resource: t('products.title').toLowerCase(),
            })}
            nearLimitLabel={t('quota.nearLimit')}
          />
          <PrimaryLink href="/products/new">{t('products.new')}</PrimaryLink>
        </div>
      }
    >
      {/* La alerta de reposicion va arriba y no escondida en una columna: es la
          informacion que hace que alguien abra esta pantalla por la mañana. */}
      {belowMinimum.length > 0 && (
        <p
          role="status"
          className="mb-6 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-4 py-3 text-sm"
        >
          {t('products.belowMinimum', { count: belowMinimum.length })}
        </p>
      )}

      {page.items.length === 0 ? (
        <Empty>{t('products.empty')}</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('products.sku')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('products.name')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('products.price')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('products.stock')}
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((product) => (
              <tr key={product.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                <td className="px-4 py-3 font-medium">{product.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">$ {product.price.toString()}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {product.trackStock ? (
                    <span className={product.isBelowMinimum ? 'text-[var(--color-warn)]' : ''}>
                      {product.onHand.toCompactString()} {product.unit}
                      {product.isBelowMinimum && (
                        <span aria-label={t('products.lowStock')} className="ml-1">
                          ⚠
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">{t('products.notTracked')}</span>
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
