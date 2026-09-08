import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { forRequest } from '@/composition/container';
import { setCustomerStatusAction } from '@/actions/customers';
import { Shell } from '@/ui/shell';
import { DetailList, StatusBadge, StatusToggle } from '@/ui/detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('customers.detail') };
}

/**
 * Ficha de un cliente.
 *
 * Un id que no existe —o que es de otra empresa— responde 404 y no 403. La
 * diferencia parece cosmetica y no lo es: un 403 confirma que el registro existe,
 * y eso ya es informacion sobre la empresa de al lado. Recorriendo identificadores
 * se podria contar cuantos clientes tiene la competencia sin ver ni uno.
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const { id } = await params;
  const { ctx, session, queries } = await forRequest();

  const customer = await queries.customers.byId(id);
  if (customer === null) notFound();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={customer.name}
      subtitle={customer.code}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge
            archived={customer.archived}
            activeLabel={t('status.active')}
            archivedLabel={t('status.archived')}
          />
          {can(ctx.actor, 'customer:write') && (
            <StatusToggle
              action={setCustomerStatusAction}
              idField="customerId"
              id={customer.id}
              archived={customer.archived}
              archiveLabel={t('customers.archive')}
              restoreLabel={t('customers.restore')}
            />
          )}
        </div>
      }
    >
      {customer.archived && (
        <p
          role="status"
          className="mb-6 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-4 py-3 text-sm"
        >
          {t('customers.archivedNotice')}
        </p>
      )}

      <DetailList
        rows={[
          { label: t('customers.code'), value: customer.code, mono: true },
          { label: t('customers.name'), value: customer.name },
          { label: t('customers.taxId'), value: customer.taxId },
          { label: t('customers.email'), value: customer.email },
          { label: t('customers.phone'), value: customer.phone },
          { label: t('customers.address'), value: customer.address },
          {
            label: t('customers.creditLimit'),
            value: customer.creditLimit === null ? null : `$ ${customer.creditLimit}`,
          },
        ]}
        emptyLabel={t('common.notSet')}
      />

      <p className="mt-8">
        <Link href="/customers" className="text-sm underline underline-offset-4">
          {t('common.back')}
        </Link>
      </p>
    </Shell>
  );
}
