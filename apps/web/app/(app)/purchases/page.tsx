import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Plus, Truck, UsersRound } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';

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
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string }>;
}) {
  const t = await getTranslations();
  const { creado } = await searchParams;
  const createdCode = noticeCode(creado);
  const format = await getFormatter();
  const { ctx, queries } = await apiForRequest();

  /*
   * The role decides whether this is read, and it is decided BEFORE asking: a 403 from the
   * API surfaces as an exception and took the whole screen down. See `@/ui/no-access`.
   */
  if (!can(ctx.actor, 'purchase:read')) {
    return (
      <Screen title={t('purchases.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const page = await queries.purchasing.receipts({ limit: 50 });

  const receivedOn = (receivedAt: Date | null): string =>
    receivedAt === null ? '—' : format.dateTime(receivedAt, { dateStyle: 'medium' });

  return (
    <Screen
      {...(createdCode !== null
        ? { toast: t('purchases.received_ok', { number: createdCode }) }
        : {})}
      title={t('purchases.title')}
      subtitle={t('purchases.subtitle')}
      action={
        <>
          <ButtonLink href="/purchases/suppliers" variant="secondary">
            <UsersRound aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('purchases.suppliers')}
          </ButtonLink>
          <PrimaryLink href="/purchases/new">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('purchases.new')}
          </PrimaryLink>
        </>
      }
    >
      {page.items.length === 0 ? (
        <Empty icon={Truck}>{t('purchases.empty')}</Empty>
      ) : (
        <>
          <DesktopOnly>
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/60">
                  <th scope="col" className={TH}>
                    {t('purchases.number')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('purchases.supplier')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('purchases.received')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('purchases.lines')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('purchases.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((receipt) => (
                  <tr
                    key={receipt.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-subtle/40"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {/* The link text is ONLY the number; the voided badge sits beside it. */}
                      <Link
                        href={`/purchases/${receipt.id}`}
                        className="font-mono text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {receipt.number}
                      </Link>
                      {receipt.status === 'voided' && (
                        <span className="ml-2">
                          <Badge tone="danger">{t('purchases.voided')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{receipt.supplierName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {receivedOn(receipt.receivedAt)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{receipt.lineCount}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                      $ {receipt.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </DesktopOnly>

          <MobileList>
            {page.items.map((receipt) => (
              <MobileListItem
                key={receipt.id}
                href={`/purchases/${receipt.id}`}
                title={<span className="font-mono text-sm">{receipt.number}</span>}
                subtitle={`${receipt.supplierName} · ${receivedOn(receipt.receivedAt)}`}
                trailing={`$ ${receipt.total}`}
                {...(receipt.status === 'voided'
                  ? {
                      trailingHint: <Badge tone="danger">{t('purchases.voided')}</Badge>,
                      muted: true,
                    }
                  : {})}
              />
            ))}
          </MobileList>
        </>
      )}
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
