import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { UpgradeNotice } from '@/ui/upgrade-notice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchases.title') };
}

/**
 * Registro de recepciones de mercancia.
 *
 * El modulo entero esta reservado al plan PRO. El aviso de abajo NO es lo que lo
 * bloquea: lo bloquea el caso de uso, que devuelve `FeatureNotAvailable` venga
 * la peticion de donde venga. Esta pantalla solo explica por que no hay nada que
 * ver, y ofrece el camino para tenerlo.
 */
export default async function PurchasesPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, session, queries } = await forRequest();

  if (!ctx.plan.has('purchasing')) {
    return (
      <Shell
        ctx={ctx}
        session={session}
        title={t('purchases.title')}
        subtitle={t('purchases.subtitle')}
      >
        <UpgradeNotice feature={t('purchases.title')} />
      </Shell>
    );
  }

  const page = await queries.purchasing.receipts({ limit: 50 });

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('purchases.title')}
      subtitle={t('purchases.subtitle')}
      action={
        <div className="flex flex-wrap items-end gap-3">
          <Link
            href="/purchases/suppliers"
            className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium"
          >
            {t('purchases.suppliers')}
          </Link>
          <PrimaryLink href="/purchases/new">{t('purchases.new')}</PrimaryLink>
        </div>
      }
    >
      {page.items.length === 0 ? (
        <Empty>{t('purchases.empty')}</Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('purchases.number')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('purchases.supplier')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('purchases.received')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('purchases.lines')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('purchases.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((receipt) => (
              <tr key={receipt.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  {receipt.number}
                  {receipt.status === 'voided' && (
                    <span className="ml-2 text-[var(--color-danger-ink)]">
                      {t('purchases.voided')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{receipt.supplierName}</td>
                <td className="px-4 py-3 text-[var(--color-muted)]">
                  {receipt.receivedAt === null
                    ? '—'
                    : format.dateTime(receipt.receivedAt, { dateStyle: 'medium' })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{receipt.lineCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">$ {receipt.total}</td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </Shell>
  );
}
