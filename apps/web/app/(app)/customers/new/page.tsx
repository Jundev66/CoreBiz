import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { CustomerForm } from '@/ui/customer-form';
import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';

/**
 * Alta de cliente.
 *
 * Va dentro del marco, como el resto. Era la UNICA pantalla de la aplicacion que se
 * pintaba suelta —un `<main>` centrado y nada mas— y con la barra horizontal apenas se
 * notaba. Con la navegacion en una columna fija, entrar aqui hacia desaparecer el menu
 * entero: parecia que el alta te sacaba del sistema.
 */
export default async function NewCustomerPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  // 404 rather than a notice, like the edit screen: a route this role cannot use does not
  // exist for it. Filling in a form only for the action to reject it at the end is worse
  // than not offering it.
  if (!can(ctx.actor, 'customer:write')) notFound();

  return (
    <Screen title={t('customers.new')} back={{ href: '/customers', label: t('customers.title') }}>
      <Card className="max-w-2xl p-5 sm:p-6">
        <CustomerForm />
      </Card>
    </Screen>
  );
}
