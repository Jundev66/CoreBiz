import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { memoryCustomerQueries } from '@/composition/memory-driver';

/**
 * Listado de clientes.
 *
 * Es un Server Component: los datos se resuelven en el servidor y al navegador solo
 * llega HTML. No hay estado de cliente, ni fetch, ni spinner. El lado de LECTURA no
 * pasa por los casos de uso ni rehidrata agregados — consulta directamente y devuelve
 * datos planos (CQRS ligero). Escribir si pasa siempre por un caso de uso.
 */
export default async function CustomersPage() {
  const t = await getTranslations();
  const { ctx } = await forRequest();

  const queries = memoryCustomerQueries(ctx.tenantId);
  const page = await queries.list({ limit: 25 });
  const used = queries.usage('customers');
  const quota = ctx.plan.quota('customers', used);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-[var(--color-muted)] hover:underline">
            ← {t('app.name')}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('customers.title')}</h1>
          <p className="mt-1 text-[var(--color-muted)]">{t('customers.subtitle')}</p>
          <Link
            href="/customers/new"
            className="mt-4 inline-block rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
          >
            {t('customers.new')}
          </Link>
        </div>

        {/* La cuota se muestra siempre, no solo al agotarse: enterarse del limite justo
            cuando te bloquea es la peor forma de descubrirlo. */}
        <div className="text-right">
          <p className="text-sm font-medium">
            {t('quota.usage', {
              current: quota.current,
              limit: quota.limit,
              resource: t('customers.title').toLowerCase(),
            })}
          </p>
          <div
            className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-line)]"
            role="progressbar"
            aria-valuenow={quota.current}
            aria-valuemin={0}
            aria-valuemax={quota.limit}
            aria-label={t('quota.usage', {
              current: quota.current,
              limit: quota.limit,
              resource: t('customers.title'),
            })}
          >
            <div
              className={
                quota.ratio >= 0.8
                  ? 'h-full bg-[var(--color-warn)]'
                  : 'h-full bg-[var(--color-brand)]'
              }
              style={{ width: `${Math.round(quota.ratio * 100)}%` }}
            />
          </div>
          {quota.ratio >= 0.8 && (
            <p className="mt-1 text-xs text-[var(--color-warn)]">{t('quota.nearLimit')}</p>
          )}
        </div>
      </div>

      {page.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-line)] px-6 py-12 text-center text-[var(--color-muted)]">
          {t('customers.empty')}
        </p>
      ) : (
        // Contenedor con scroll propio: la tabla nunca desborda la pagina en movil.
        <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
          <table className="w-full border-collapse bg-[var(--color-surface)] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('customers.code')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('customers.name')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('customers.taxId')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('customers.creditLimit')}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((customer) => (
                <tr key={customer.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{customer.code}</td>
                  <td className="px-4 py-3 font-medium">{customer.name}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{customer.taxId ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {customer.creditLimit ? (
                      `$ ${customer.creditLimit.toString()}`
                    ) : (
                      <span className="text-[var(--color-muted)]">
                        {t('customers.noCreditLimit')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-10 border-t border-[var(--color-line)] pt-6">
        <p className="text-sm text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </main>
  );
}
