import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { setCustomerStatusAction } from '@/actions/customers';
import { Shell } from '@/ui/shell';
import { BackLink, SecondaryLink } from '@/ui/primitives';
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
export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const t = await getTranslations();
  const { id } = await params;
  const { guardado } = await searchParams;
  const { ctx, session, queries } = await apiForRequest();

  // Without `customer:read` this record does not exist for the requester — the same answer
  // the API gives, so the screen does not depend on the 403 never arriving.
  if (!can(ctx.actor, 'customer:read')) notFound();

  const customer = await queries.customers.byId(id);
  if (customer === null) notFound();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={customer.name}
      subtitle={customer.code}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <BackLink href="/customers">{t('customers.title')}</BackLink>
          <StatusBadge
            archived={customer.archived}
            activeLabel={t('status.active')}
            archivedLabel={t('status.archived')}
          />
          {can(ctx.actor, 'customer:write') && (
            <SecondaryLink href={`/customers/${customer.id}/edit`}>
              {t('common.edit')}
            </SecondaryLink>
          )}
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
    </Shell>
  );
}
