import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import { Plus, ScanLine, Truck, UsersRound } from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, PrimaryLink, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList, MobileListItem } from '@/ui/list';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { Pagination } from '@/ui/pagination';

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
  searchParams: Promise<{ creado?: string; cursor?: string; limite?: string }>;
}) {
  const t = await getTranslations();
  const { creado, cursor, limite } = await searchParams;
  const createdCode = noticeCode(creado);
  const format = await getFormatter();
  const pageSize = limite ? Math.min(100, Math.max(5, parseInt(limite, 10) || 50)) : 50;
  const { ctx, data: page } = await withSession((queries) =>
    queries.purchasing.receipts({
      limit: pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
  );

  /*
   * The session and the list travel together; the role still decides what is shown. A 403
   * from the API arrives as `null` and becomes a notice. See `@/ui/no-access`.
   */
  if (!can(ctx.actor, 'purchase:read') || page === null) {
    return (
      <Screen title={t('purchases.title')}>
        <NoAccess />
      </Screen>
    );
  }

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
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <ButtonLink
            href="/purchases/suppliers"
            variant="secondary"
            className="justify-center text-xs sm:text-sm px-2.5 sm:px-3"
          >
            <UsersRound aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{t('purchases.suppliers')}</span>
          </ButtonLink>
          {can(ctx.actor, 'purchase:receive') && (
            <ButtonLink
              href="/purchases/scan"
              variant="secondary"
              className="justify-center text-xs sm:text-sm px-2.5 sm:px-3"
            >
              <ScanLine aria-hidden="true" className="size-4 shrink-0 text-brand" />
              <span className="truncate">{t('purchases.scanAction')}</span>
            </ButtonLink>
          )}
          {can(ctx.actor, 'purchase:receive') && (
            <PrimaryLink
              href="/purchases/new"
              className="col-span-2 justify-center text-xs sm:text-sm px-2.5 sm:px-3 sm:col-span-1"
            >
              <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{t('purchases.new')}</span>
            </PrimaryLink>
          )}
        </div>
      }
    >
      {page.items.length === 0 ? (
        <Empty
          icon={Truck}
          action={
            <div className="grid w-full max-w-xs grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-2 sm:items-center sm:justify-center">
              {can(ctx.actor, 'purchase:receive') && (
                <ButtonLink
                  href="/purchases/scan"
                  variant="secondary"
                  size="sm"
                  className="justify-center"
                >
                  <ScanLine aria-hidden="true" className="size-4 text-brand" />
                  <span>{t('purchases.scanAction')}</span>
                </ButtonLink>
              )}
              {can(ctx.actor, 'purchase:receive') && (
                <ButtonLink href="/purchases/new" size="sm" className="justify-center">
                  <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                  <span>{t('purchases.new')}</span>
                </ButtonLink>
              )}
            </div>
          }
        >
          {t('purchases.empty')}
        </Empty>
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

          <Pagination
            nextCursor={page.nextCursor}
            currentCursor={cursor}
            basePath="/purchases"
            itemCount={page.items.length}
            pageSize={pageSize}
            params={{ ...(limite ? { limite } : {}) }}
          />
        </>
      )}
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
