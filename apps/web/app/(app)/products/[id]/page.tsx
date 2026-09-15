import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pencil } from 'lucide-react';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { setProductStatusAction } from '@/actions/sales';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { SectionTitle } from '@/ui/primitives';
import { DetailList, StatusBadge, StatusToggle } from '@/ui/detail';
import { StockAdjustForm } from '@/ui/stock-adjust-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('products.detail') };
}

/**
 * Ficha de un producto: sus datos, su estado y SU LIBRO DE MOVIMIENTOS.
 *
 * El libro es la mitad que importa. El saldo de un producto no es un campo que
 * alguien fija, es la suma de lo que entro y salio, y esta pantalla es donde eso
 * deja de ser una afirmacion del README y se puede comprobar: cada linea dice que
 * paso, cuanto y con que saldo quedo.
 *
 * Aqui vive tambien el ajuste, y no en el listado como estaba. Contar un estante y
 * corregir el saldo es una tarea que empieza mirando el historico —"¿por que dice
 * ocho si veo cinco?"— y tenerlos en pantallas distintas partia esa tarea en dos.
 */
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { id } = await params;
  const { guardado } = await searchParams;
  const { ctx, queries } = await apiForRequest();

  const product = await queries.products.byId(id);
  if (product === null) notFound();

  const movements = product.trackStock ? await queries.products.movements(product.id, 50) : [];
  const canWrite = can(ctx.actor, 'product:write');

  return (
    <Screen
      title={product.name}
      subtitle={product.sku}
      back={{ href: '/products', label: t('products.title') }}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
      action={
        <>
          <StatusBadge
            archived={product.archived}
            activeLabel={t('status.active')}
            archivedLabel={t('status.archived')}
          />
          {canWrite && (
            <Link
              href={`/products/${product.id}/edit`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('common.edit')}
            </Link>
          )}
          {canWrite && (
            <StatusToggle
              action={setProductStatusAction}
              idField="productId"
              id={product.id}
              archived={product.archived}
              archiveLabel={t('products.archive')}
              restoreLabel={t('products.restore')}
            />
          )}
        </>
      }
    >
      {product.archived && (
        <Alert tone="warn" role="status" className="mb-6">
          {t('products.archivedNotice')}
        </Alert>
      )}

      <div className="space-y-8">
        <DetailList
          rows={[
            { label: t('products.sku'), value: product.sku, mono: true },
            { label: t('products.name'), value: product.name },
            { label: t('products.price'), value: `$ ${product.price}` },
            {
              label: t('products.cost'),
              value: product.cost === null ? null : `$ ${product.cost}`,
            },
            { label: t('products.unit'), value: product.unit },
            {
              label: t('products.stock'),
              value: product.trackStock
                ? `${product.onHand ?? '0'} ${product.unit}`
                : t('products.notTracked'),
            },
            { label: t('products.minStock'), value: product.minStock },
          ]}
          emptyLabel={t('common.notSet')}
        />

        {/* Ajustar solo tiene sentido en lo que lleva inventario, y solo si no esta
            archivado: corregir el saldo de algo que ya no se vende es trabajo que no
            le sirve a nadie. */}
        {product.trackStock && !product.archived && canWrite && (
          <StockAdjustForm
            productId={product.id}
            sku={product.sku}
            name={product.name}
            onHand={product.onHand ?? '0'}
            unit={product.unit}
          />
        )}

        {product.trackStock && (
          <section>
            <SectionTitle>{t('products.movements')}</SectionTitle>

            {movements.length === 0 ? (
              <Empty>{t('products.noMovements')}</Empty>
            ) : (
              <TableFrame>
                <thead>
                  <tr className="border-b border-line bg-canvas text-xs text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('products.movementDate')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('products.movementKind')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('products.movementQuantity')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('products.movementBalance')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t('products.movementReason')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement, index) => (
                    <tr
                      key={`${movement.at.toISOString()}-${index}`}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                        {format.dateTime(movement.at, { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {t(`products.movementKinds.${movement.kind}`)}
                      </td>
                      {/* El signo se conserva: una salida se lee "-20" y una entrada
                          "15". Mostrarlo en valor absoluto obligaria a deducir la
                          direccion a partir del tipo, que es justo lo que esta columna
                          evita. */}
                      <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                        {movement.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-ink tabular-nums">
                        {movement.balance}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {movement.reason ?? movement.reference ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </section>
        )}
      </div>
    </Screen>
  );
}
