import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell, QuotaBar, TableFrame, Empty } from '@/ui/shell';
import { UpgradeNotice } from '@/ui/upgrade-notice';
import { SupplierForm } from '@/ui/supplier-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('suppliers.title') };
}

/**
 * Proveedores.
 *
 * El formulario va al lado de la lista y no en otra pantalla: dar de alta un
 * proveedor casi siempre ocurre mientras se registra una entrada de mercancia,
 * y obligar a navegar a otra ruta y volver rompe esa tarea por la mitad.
 */
export default async function SuppliersPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await forRequest();

  if (!ctx.plan.has('purchasing')) {
    return (
      <Shell
        ctx={ctx}
        session={session}
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle')}
      >
        <UpgradeNotice feature={t('purchases.title')} />
      </Shell>
    );
  }

  const [page, used] = await Promise.all([
    queries.purchasing.suppliers({ limit: 50 }),
    queries.usage.current('suppliers'),
  ]);
  const quota = ctx.plan.quota('suppliers', used);

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('suppliers.title')}
      subtitle={t('suppliers.subtitle')}
      action={
        <QuotaBar
          current={quota.current}
          limit={quota.limit}
          label={t('quota.usage', {
            current: quota.current,
            limit: quota.limit,
            resource: t('suppliers.title').toLowerCase(),
          })}
          nearLimitLabel={t('quota.nearLimit')}
        />
      }
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="suppliers-list">
          <h2 id="suppliers-list" className="sr-only">
            {t('suppliers.title')}
          </h2>

          {page.items.length === 0 ? (
            <Empty>{t('suppliers.empty')}</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.code')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.name')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.contact')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.phone')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{supplier.code}</td>
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {supplier.contactName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{supplier.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </section>

        <aside aria-labelledby="supplier-form-heading">
          <h2 id="supplier-form-heading" className="mb-4 text-lg font-medium">
            {t('suppliers.new')}
          </h2>
          <SupplierForm />
        </aside>
      </div>
    </Shell>
  );
}
