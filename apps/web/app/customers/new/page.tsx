import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { BackLink } from '@/ui/primitives';
import { CustomerForm } from '@/ui/customer-form';

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
  const { ctx, session } = await apiForRequest();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('customers.new')}
      action={<BackLink href="/customers">{t('customers.title')}</BackLink>}
    >
      <div className="max-w-2xl">
        <CustomerForm />
      </div>
    </Shell>
  );
}
