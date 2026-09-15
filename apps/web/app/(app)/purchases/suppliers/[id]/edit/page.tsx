import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { SupplierForm } from '@/ui/supplier-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('suppliers.edit') };
}

/**
 * Corregir un proveedor.
 *
 * Vive bajo `/purchases/suppliers/[id]/edit` y convive sin conflicto con
 * `/purchases/[id]`, que es la ficha de una RECEPCION: en el App Router un segmento
 * literal gana siempre a uno dinamico, asi que `/purchases/suppliers` no entra nunca
 * por `/purchases/[id]`.
 *
 * Un proveedor archivado tambien se puede corregir. Archivar oculta, no congela:
 * corregir el telefono de alguien con quien se dejo de trabajar es justo lo que hace
 * falta el dia que se le vuelve a llamar.
 */
export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const { id } = await params;
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'supplier:write')) notFound();

  const supplier = await queries.purchasing.supplierById(id);
  if (supplier === null) notFound();

  return (
    <Screen
      title={t('suppliers.edit')}
      subtitle={supplier.name}
      back={{ href: '/purchases/suppliers', label: t('suppliers.title') }}
    >
      <Card className="max-w-2xl p-5 sm:p-6">
        <SupplierForm
          supplier={{
            id: supplier.id,
            code: supplier.code,
            name: supplier.name,
            contactName: supplier.contactName,
            phone: supplier.phone,
            email: supplier.email,
            taxId: supplier.taxId,
            notes: supplier.notes,
          }}
        />
      </Card>
    </Screen>
  );
}
