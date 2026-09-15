import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { ProductForm } from '@/ui/product-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('products.edit') };
}

/**
 * Corregir un producto.
 *
 * El formulario NO trae el saldo, y no es un olvido de esta pantalla: el esquema lo
 * rechaza, el caso de uso comprueba que no cambio y el dominio garantiza que ninguno
 * de los metodos que se invocan deja un movimiento pendiente. Para cuadrar el
 * inventario esta el ajuste, que exige un motivo — y vive en la ficha, al lado del
 * libro de movimientos que lo explica.
 */
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const { id } = await params;
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'product:write')) notFound();

  const product = await queries.products.byId(id);
  if (product === null) notFound();

  return (
    <Screen
      title={t('products.edit')}
      subtitle={product.name}
      back={{ href: `/products/${id}`, label: t('products.detail') }}
    >
      <Card className="max-w-2xl p-5 sm:p-6">
        <ProductForm
          product={{
            id: product.id,
            sku: product.sku,
            name: product.name,
            price: product.price,
            cost: product.cost,
            unit: product.unit,
            minStock: product.minStock,
            description: product.description,
            taxable: product.taxable,
          }}
        />
      </Card>
    </Screen>
  );
}
