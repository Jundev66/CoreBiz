import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { CustomerForm } from '@/ui/customer-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('customers.edit') };
}

/**
 * Corregir un cliente.
 *
 * Dos motivos para responder 404, y los dos acaban en la misma pantalla a proposito:
 *
 *   - el cliente no existe, o es de otra empresa. Un 403 confirmaria que ese
 *     identificador existe en alguna parte, y recorriendolos se podria contar cuantos
 *     clientes tiene la competencia sin ver ni uno;
 *   - quien mira no tiene permiso de escritura. Aqui `notFound()` es tambien lo
 *     correcto: para un vendedor de solo lectura, esta pantalla sencillamente no
 *     existe, y un 403 le diria que hay una funcion que no le enseñan.
 *
 * Esto NO es la medida de seguridad: la Server Action se puede invocar directamente
 * sin pasar por aqui, y quien la aplica es el caso de uso. Esto solo evita enseñar un
 * formulario que iba a fallar al enviarse.
 */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const { id } = await params;
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'customer:write')) notFound();

  const customer = await queries.customers.byId(id);
  if (customer === null) notFound();

  return (
    <Screen
      title={t('customers.edit')}
      subtitle={customer.name}
      back={{ href: `/customers/${id}`, label: t('customers.detail') }}
    >
      <Card className="max-w-2xl p-5 sm:p-6">
        <CustomerForm
          customer={{
            id: customer.id,
            code: customer.code,
            name: customer.name,
            taxId: customer.taxId,
            email: customer.email,
            phone: customer.phone,
            creditLimit: customer.creditLimit,
            addressLine1: customer.addressLine1,
            addressCity: customer.addressCity,
            addressState: customer.addressState,
          }}
        />
      </Card>
    </Screen>
  );
}
