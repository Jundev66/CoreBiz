import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Archive, ArrowLeft, Package, Plus } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Alert, Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; creado?: string }>;
}) {
  const t = await getTranslations();
  const { archivados, creado } = await searchParams;
  const createdCode = noticeCode(creado);
  const { ctx, queries } = await apiForRequest();

  /*
   * The role decides whether this is read, and it is decided BEFORE asking: a 403 from the
   * API surfaces as an exception and took the whole screen down. See `@/ui/no-access`.
   */
  if (!can(ctx.actor, 'product:read')) {
    return (
      <Screen title={t('products.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const includeArchived = archivados === '1';
  const page = await queries.products.list({ limit: 50, includeArchived });

  const belowMinimum = page.items.filter((p) => p.belowMinimum);

  return (
    <Screen
      title={t('products.title')}
      subtitle={t('products.subtitle')}
      {...(createdCode !== null ? { toast: t('products.created', { sku: createdCode }) } : {})}
      action={
        <PrimaryLink href="/products/new">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          {t('products.new')}
        </PrimaryLink>
      }
    >
      <div className="space-y-4">
        {/* La alerta de reposicion va arriba y no escondida en una columna: es la
            informacion que hace que alguien abra esta pantalla por la mañana. */}
        {belowMinimum.length > 0 && (
          <Alert tone="warn" role="status">
            {t('products.belowMinimum', { count: belowMinimum.length })}
          </Alert>
        )}

        {/* Los archivados no se esconden del todo: se ven pidiendolo. Ocultarlos sin
            forma de llegar a ellos convierte "archivar" en "perder". */}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={includeArchived ? '/products' : '/products?archivados=1'}
            variant="secondary"
            size="sm"
          >
            {includeArchived ? (
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
            ) : (
              <Archive aria-hidden="true" className="size-4" strokeWidth={1.75} />
            )}
            {includeArchived ? t('common.back') : t('products.showArchived')}
          </ButtonLink>
        </div>

        {page.items.length === 0 ? (
          <Empty
            icon={Package}
            action={
              <ButtonLink href="/products/new" size="sm">
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                {t('products.new')}
              </ButtonLink>
            }
          >
            {t('products.empty')}
          </Empty>
        ) : (
          <>
            <DesktopOnly>
              <TableFrame>
                <thead>
                  <tr className="border-b border-line bg-subtle/60">
                    <th scope="col" className={TH}>
                      {t('products.sku')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('products.name')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('products.price')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('products.stock')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">{t('common.view')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Column order is load-bearing: the E2E `readStock` reads the stock
                      from the fourth `td` of the row (sku, name, price, stock). */}
                  {page.items.map((product) => (
                    <tr
                      key={product.id}
                      className={`border-b border-line transition-colors last:border-0 hover:bg-subtle/40 ${product.archived ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">{product.sku}</td>
                      <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        $ {product.price}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {product.trackStock ? (
                          <span className={product.belowMinimum ? 'font-medium text-warn-ink' : ''}>
                            {product.onHand} {product.unit}
                            {product.belowMinimum && (
                              <AlertTriangle
                                aria-label={t('products.lowStock')}
                                className="ml-1.5 inline size-3.5 align-[-2px]"
                                strokeWidth={2}
                              />
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">{t('products.notTracked')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/products/${product.id}`}
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
              {page.items.map((product) => (
                <MobileListItem
                  key={product.id}
                  href={`/products/${product.id}`}
                  title={product.name}
                  subtitle={
                    <>
                      <span className="font-mono text-xs">{product.sku}</span>
                      {` · $ ${product.price}`}
                    </>
                  }
                  trailing={
                    product.trackStock ? (
                      <span className={product.belowMinimum ? 'text-warn-ink' : ''}>
                        {product.onHand} {product.unit}
                      </span>
                    ) : (
                      <span className="text-sm font-normal text-muted">
                        {t('products.notTracked')}
                      </span>
                    )
                  }
                  {...(product.archived
                    ? { trailingHint: <Badge>{t('status.archived')}</Badge>, muted: true }
                    : product.trackStock && product.belowMinimum
                      ? { trailingHint: <Badge tone="warn">{t('products.lowStock')}</Badge> }
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
