import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Banknote, BookOpen } from 'lucide-react';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { listAccounts, listJournalEntries } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Alert, Badge } from '@/ui/feedback';
import { buttonClasses } from '@/ui/button';
import { SectionTitle } from '@/ui/primitives';
import { DetailList } from '@/ui/detail';
import { VoidReceiptForm } from '@/ui/void-receipt-form';
import { PAYMENT_METHOD_LABELS } from '@/ui/payment-methods';

function formatMinor(minorStr: string, currency = 'USD'): string {
  const minor = BigInt(minorStr || '0');
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

function parseDecimalToMinor(raw: string): bigint {
  const normalized = raw.trim().replace(',', '.');
  const [majorPart = '0', minorPart = ''] = normalized.split('.');
  const sign = majorPart.startsWith('-') ? -1n : 1n;
  const absMajor = BigInt(majorPart.replace('-', '') || '0');
  const paddedMinor = BigInt((minorPart + '00').slice(0, 2));
  return sign * (absMajor * 100n + paddedMinor);
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Registro de Compra',
  PAYMENT: 'Pago a Proveedor',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('purchases.detail') };
}

/**
 * Detalle de una recepcion de mercancia.
 *
 * Existe porque sin ella el modulo estaba cojo de una forma poco visible: se podia
 * registrar una entrada y no volver a verla nunca. El listado dice cuanto y de
 * quien; para saber QUE llego —y a que coste, que es lo que decide el margen— hacia
 * falta esta pantalla.
 *
 * La descripcion y la unidad de cada linea van congeladas en el documento. Si
 * manana se renombra "Harina 1 kg", la recepcion de marzo sigue diciendo lo que se
 * recibio en marzo, que es para lo que sirve un documento.
 */
export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { id } = await params;
  const { ctx, data: receipt } = await withSession((queries) => queries.purchasing.receiptById(id));

  // 404 y no 403: un 403 confirmaria que el documento existe en otra empresa.
  if (receipt === null) notFound();

  const voided = receipt.status === 'voided';
  const canReadAccounting = can(ctx.actor, 'accounting:read');
  const [journalEntries, accounts] = await Promise.all([
    canReadAccounting ? listJournalEntries().catch(() => []) : Promise.resolve([]),
    canReadAccounting ? listAccounts().catch(() => []) : Promise.resolve([]),
  ]);

  const accountById = new Map(accounts.map((acc) => [acc.id, acc]));
  const relatedEntries = journalEntries.filter((entry) => entry.sourceId === receipt.id);
  const purchaseEntry = relatedEntries.find((entry) => entry.sourceType === 'PURCHASE');
  const paymentEntries = relatedEntries.filter((entry) => entry.sourceType === 'PAYMENT');

  const payableAccount = accounts.find(
    (a) => a.code === '2.1.01' || a.code === '2010' || a.category === 'LIABILITY',
  );
  const isCashPurchase =
    purchaseEntry !== undefined &&
    payableAccount !== undefined &&
    !purchaseEntry.lines.some(
      (l) => l.accountId === payableAccount.id && BigInt(l.creditMinor) > 0n,
    );

  const totalMinor = purchaseEntry
    ? BigInt(purchaseEntry.totalCreditMinor)
    : parseDecimalToMinor(receipt.total);
  const paidMinor = isCashPurchase
    ? totalMinor
    : paymentEntries.reduce((acc, entry) => acc + BigInt(entry.totalDebitMinor), 0n);
  const remainingMinor = totalMinor > paidMinor ? totalMinor - paidMinor : 0n;
  const currency = purchaseEntry?.lines[0]?.currency ?? ctx.settings.baseCurrency;
  const canPay = !voided && remainingMinor > 0n && can(ctx.actor, 'purchase:receive');
  const receiptExt = receipt as typeof receipt & {
    installments?: ReadonlyArray<{
      readonly id: string;
      readonly installmentNumber: number;
      readonly frequency: string;
      readonly dueDate: string;
      readonly currency: string;
      readonly amountMinor: string;
      readonly paidMinor: string;
      readonly status: string;
    }>;
    payments?: ReadonlyArray<{
      readonly id: string;
      readonly paymentNumber: string;
      readonly paymentMethod: string;
      readonly paymentCurrency: string;
      readonly paymentAmountMinor: string;
      readonly documentCurrency: string;
      readonly appliedAmountMinor: string;
      readonly accountId: string;
      readonly accountCode: string | null;
      readonly accountName: string | null;
      readonly paymentDate: string;
      readonly reference: string | null;
    }>;
  };

  return (
    <Screen
      title={receipt.number}
      subtitle={receipt.supplierName}
      back={{ href: '/purchases', label: t('purchases.title') }}
      action={
        <div className="flex items-center gap-2">
          {voided && <Badge tone="danger">{t('deliveryNotes.statuses.voided')}</Badge>}
          {canPay && (
            <Link href={`/purchases/${receipt.id}/pay`} className={buttonClasses({ size: 'sm' })}>
              <Banknote className="size-3.5" />
              <span>Registrar Pago</span>
            </Link>
          )}
        </div>
      }
    >
      {voided && (
        <Alert tone="danger" role="status" className="mb-6">
          {t('purchases.voidedNotice', { reason: receipt.voidReason ?? '—' })}
        </Alert>
      )}

      <div className="space-y-8">
        <DetailList
          rows={[
            { label: t('purchases.number'), value: receipt.number, mono: true },
            {
              label: t('purchases.supplier'),
              value: `${receipt.supplierCode} · ${receipt.supplierName}`,
            },
            {
              label: t('purchases.received'),
              value:
                receipt.receivedAt === null
                  ? null
                  : format.dateTime(receipt.receivedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
            },
            { label: t('purchases.supplierReference'), value: receipt.supplierReference },
            { label: t('purchases.notes'), value: receipt.notes },
            { label: t('purchases.total'), value: formatMinor(totalMinor.toString(), currency) },
          ]}
          emptyLabel={t('common.notSet')}
        />

        <section>
          <SectionTitle>{t('purchases.lines')}</SectionTitle>

          <TableFrame>
            <thead>
              <tr className="border-b border-line bg-canvas text-xs text-muted">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('purchases.lineDescription')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('purchases.lineQuantity')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('purchases.lineUnitCost')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('purchases.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.lineNo} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{line.description}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-ink tabular-nums">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-ink tabular-nums">
                    $ {line.unitCost}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-ink tabular-nums">
                    $ {line.lineTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </section>

        {(receiptExt.installments?.length ?? 0) > 0 && (
          <section className="space-y-3">
            <SectionTitle>Cronograma de Cuotas</SectionTitle>
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Cuota</th>
                  <th className="px-4 py-3">Frecuencia</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Monto Cuota</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs text-ink">
                {(receiptExt.installments ?? []).map((inst) => (
                  <tr key={inst.id}>
                    <td className="px-4 py-3 font-mono font-bold">#{inst.installmentNumber}</td>
                    <td className="px-4 py-3 text-muted">
                      {inst.frequency === 'BIWEEKLY'
                        ? 'Quincenal'
                        : inst.frequency === 'MONTHLY'
                          ? 'Mensual'
                          : 'Única'}
                    </td>
                    <td className="px-4 py-3">{new Date(inst.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatMinor(inst.amountMinor, inst.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatMinor(inst.paidMinor, inst.currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={
                          inst.status === 'PAID'
                            ? 'success'
                            : inst.status === 'PARTIALLY_PAID'
                              ? 'warn'
                              : 'brand'
                        }
                      >
                        {inst.status === 'PAID'
                          ? 'Pagada Completa'
                          : inst.status === 'PARTIALLY_PAID'
                            ? 'Pagada Parcial'
                            : 'Pendiente'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canPay && inst.status !== 'PAID' ? (
                        <Link
                          href={`/purchases/${receipt.id}/pay`}
                          className="font-semibold text-brand hover:underline"
                        >
                          Pagar
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </section>
        )}

        {/* Anular solo se ofrece si la recepcion sigue viva Y quien mira puede hacerlo. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Pagos al Proveedor</SectionTitle>
            {canPay && (
              <Link
                href={`/purchases/${receipt.id}/pay`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Banknote className="size-3.5" />
                <span>Abonar desde Activo / USDT</span>
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-card border border-line bg-surface p-4">
              <span className="mb-1 block text-xs text-muted">Total Compra</span>
              <span className="font-mono text-base font-bold text-ink">
                {formatMinor(totalMinor.toString(), currency)}
              </span>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <span className="mb-1 block text-xs text-muted">Pagado</span>
              <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatMinor(paidMinor.toString(), currency)}
              </span>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <span className="mb-1 block text-xs text-muted">Saldo Pendiente</span>
              <span className="font-mono text-base font-bold text-brand">
                {formatMinor(remainingMinor.toString(), currency)}
              </span>
            </div>
          </div>

          {(receiptExt.payments?.length ?? 0) > 0 ? (
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Nro. Pago</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Cuenta Origen</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3 text-right">Monto Pagado</th>
                  <th className="px-4 py-3 text-right">Aplicado a Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs text-ink">
                {(receiptExt.payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{p.paymentNumber}</td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(p.paymentDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.accountCode ? `${p.accountCode} · ${p.accountName}` : p.accountId}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">{p.reference ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatMinor(p.paymentAmountMinor, p.paymentCurrency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMinor(p.appliedAmountMinor, p.documentCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          ) : paymentEntries.length === 0 ? (
            <Empty>
              {isCashPurchase
                ? 'Compra registrada al contado.'
                : 'Aún no se han registrado pagos parciales o totales para esta compra.'}
            </Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
                  <th className="px-4 py-3">Asiento</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cuenta de Activo Origen</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3 text-right">Monto Pagado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs text-ink">
                {paymentEntries.map((entry) => {
                  const creditLine = entry.lines.find((l) => BigInt(l.creditMinor) > 0n);
                  const sourceAcc = creditLine ? accountById.get(creditLine.accountId) : undefined;
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-mono font-semibold">#{entry.entryNumber}</td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {sourceAcc
                          ? `${sourceAcc.code} · ${sourceAcc.name}`
                          : (creditLine?.accountId ?? '—')}
                      </td>
                      <td className="px-4 py-3 text-muted">{entry.description}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {formatMinor(entry.totalDebitMinor, creditLine?.currency ?? currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>
          )}
        </section>

        {canReadAccounting && (
          <section className="space-y-3">
            <SectionTitle>Asientos Contables (Libro Diario)</SectionTitle>
            {relatedEntries.length === 0 ? (
              <Empty>No se encontraron asientos contables vinculados a esta compra.</Empty>
            ) : (
              <div className="space-y-4">
                {relatedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="overflow-hidden rounded-card border border-line bg-surface"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle/40 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <BookOpen className="size-4 text-brand" />
                        <span className="font-mono font-bold text-ink">
                          Asiento #{entry.entryNumber}
                        </span>
                        <Badge tone="neutral">
                          {SOURCE_TYPE_LABELS[entry.sourceType] ?? entry.sourceType}
                        </Badge>
                        <span className="text-muted">{entry.description}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                    <TableFrame>
                      <thead>
                        <tr className="border-b border-line bg-subtle/20 text-xs font-semibold uppercase text-muted">
                          <th className="px-4 py-2.5">Cuenta</th>
                          <th className="px-4 py-2.5">Detalle</th>
                          <th className="px-4 py-2.5 text-right">Débito</th>
                          <th className="px-4 py-2.5 text-right">Crédito</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-xs text-ink">
                        {entry.lines.map((line, index) => {
                          const account = accountById.get(line.accountId);
                          return (
                            <tr key={`${entry.id}-${index}`}>
                              <td className="px-4 py-2.5 font-medium">
                                {account ? `${account.code} · ${account.name}` : line.accountId}
                              </td>
                              <td className="px-4 py-2.5 text-muted">{line.memo ?? '—'}</td>
                              <td className="px-4 py-2.5 text-right font-mono">
                                {line.debitMinor !== '0'
                                  ? formatMinor(line.debitMinor, line.currency)
                                  : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">
                                {line.creditMinor !== '0'
                                  ? formatMinor(line.creditMinor, line.currency)
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </TableFrame>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!voided && can(ctx.actor, 'purchase:void') && (
          <div className="max-w-2xl">
            <VoidReceiptForm goodsReceiptId={receipt.id} number={receipt.number} />
          </div>
        )}
      </div>
    </Screen>
  );
}
