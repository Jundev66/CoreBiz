import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell, QuotaBar, PrimaryLink, TableFrame, Empty } from '@/ui/shell';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; creado?: string }>;
}) {
  const t = await getTranslations();
  const { archivados, creado } = await searchParams;
  const { ctx, session, queries } = await apiForRequest();

  const includeArchived = archivados === '1';
  const page = await queries.products.list({ limit: 50, includeArchived });
  const quota = ctx.plan.quota('products', await queries.usage.current('products'));

  const belowMinimum = page.items.filter((p) => p.belowMinimum);

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('products.title')}
      subtitle={t('products.subtitle')}
      {...(creado !== undefined ? { toast: t('products.created', { sku: creado }) } : {})}
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

      {/* Los archivados no se esconden del todo: se ven pidiendolo. Ocultarlos sin
          forma de llegar a ellos convierte "archivar" en "perder". */}
      <p className="mb-4 text-sm">
        <Link
          href={includeArchived ? '/products' : '/products?archivados=1'}
          className="underline underline-offset-4 text-[var(--color-muted)]"
        >
          {includeArchived ? t('common.back') : t('products.showArchived')}
        </Link>
      </p>

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
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{t('common.view')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((product) => (
              <tr
                key={product.id}
                className={
                  product.archived
                    ? 'border-b border-[var(--color-line)] opacity-60 last:border-0'
                    : 'border-b border-[var(--color-line)] last:border-0'
                }
              >
                <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                <td className="px-4 py-3 font-medium">{product.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">$ {product.price}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {product.trackStock ? (
                    <span className={product.belowMinimum ? 'text-[var(--color-warn-ink)]' : ''}>
                      {product.onHand} {product.unit}
                      {product.belowMinimum && (
                        <span aria-label={t('products.lowStock')} className="ml-1">
                          ⚠
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">{t('products.notTracked')}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/products/${product.id}`}
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
