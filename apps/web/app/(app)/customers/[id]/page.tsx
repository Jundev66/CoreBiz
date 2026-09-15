import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Pencil } from 'lucide-react';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { setCustomerStatusAction } from '@/actions/customers';
import { Screen } from '@/ui/shell';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
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
  const { ctx, data: customer } = await withSession((queries) => queries.customers.byId(id));

  // Without `customer:read` this record does not exist for the requester — the same answer
  // the API gives: its 403 arrives as `null`, like a record that is not there.
  if (!can(ctx.actor, 'customer:read') || customer === null) notFound();

  const canWrite = can(ctx.actor, 'customer:write');

  return (
    <Screen
      title={customer.name}
      subtitle={customer.code}
      back={{ href: '/customers', label: t('customers.title') }}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
      action={
        <>
          <StatusBadge
            archived={customer.archived}
            activeLabel={t('status.active')}
            archivedLabel={t('status.archived')}
          />
          {canWrite && (
            <Link
              href={`/customers/${customer.id}/edit`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('common.edit')}
            </Link>
          )}
          {canWrite && (
            <StatusToggle
              action={setCustomerStatusAction}
              idField="customerId"
              id={customer.id}
              archived={customer.archived}
              archiveLabel={t('customers.archive')}
              restoreLabel={t('customers.restore')}
            />
          )}
        </>
      }
    >
      {/* The ONLY live region inside `main` on this screen: the archived notice. */}
      {customer.archived && (
        <Alert tone="warn" role="status" className="mb-6">
          {t('customers.archivedNotice')}
        </Alert>
      )}

      <div className="max-w-4xl">
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
      </div>
    </Screen>
  );
}
