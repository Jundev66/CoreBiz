import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts, listJournalEntries } from '@/api/accounting';
import { Screen } from '@/ui/shell';
import { Alert } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { PayPurchaseForm } from '@/ui/pay-purchase-form';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';

function parseDecimalToMinor(raw: string): bigint {
  const normalized = raw.trim().replace(',', '.');
  const [majorPart = '0', minorPart = ''] = normalized.split('.');
  const sign = majorPart.startsWith('-') ? -1n : 1n;
  const absMajor = BigInt(majorPart.replace('-', '') || '0');
  const paddedMinor = BigInt((minorPart + '00').slice(0, 2));
  return sign * (absMajor * 100n + paddedMinor);
}

function formatMinorDecimal(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents}`;
}

export default async function PayPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, data: receipt } = await apiForRequest().then(async (session) => ({
    ...session,
    data: await session.queries.purchasing.receiptById(id),
  }));

  if (!can(ctx.actor, 'purchase:receive')) {
    return (
      <Screen
        title="Registrar Pago a Proveedor"
        back={{ href: `/purchases/${id}`, label: 'Detalle de Compra' }}
      >
        <NoAccess />
      </Screen>
    );
  }

  if (!receipt || receipt.status === 'voided') {
    notFound();
  }

  const [accounts, journalEntries] = await Promise.all([
    listAccounts().catch(() => []),
    listJournalEntries().catch(() => []),
  ]);

  const assetAccounts = filterLiquidAssetAccounts(accounts).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  const receiptEntries = journalEntries.filter((e) => e.sourceId === receipt.id);
  const purchaseEntry = receiptEntries.find((e) => e.sourceType === 'PURCHASE');
  const totalMinor = purchaseEntry
    ? BigInt(purchaseEntry.totalCreditMinor)
    : parseDecimalToMinor(receipt.total);
  const paidMinor = receiptEntries
    .filter((e) => e.sourceType === 'PAYMENT')
    .reduce((acc, e) => acc + BigInt(e.totalDebitMinor), 0n);
  const remainingMinor = totalMinor > paidMinor ? totalMinor - paidMinor : 0n;
  const currency = purchaseEntry?.lines[0]?.currency ?? ctx.settings.baseCurrency;
  const defaultExchangeRate = ctx.settings.exchangeRateScaled
    ? Number(ctx.settings.exchangeRateScaled) / 100_000_000
    : 50;
  const receiptWithInstallments = receipt as typeof receipt & {
    installments?: ReadonlyArray<{
      readonly id: string;
      readonly installmentNumber: number;
      readonly dueDate: string;
      readonly currency: string;
      readonly amountMinor: string;
      readonly paidMinor: string;
      readonly status: string;
    }>;
  };

  return (
    <Screen
      title={`Pagar Compra ${receipt.number}`}
      subtitle={`Abono parcial o total a ${receipt.supplierName} con soporte multi-moneda USD ↔ VES`}
      back={{ href: `/purchases/${id}`, label: receipt.number }}
    >
      {remainingMinor <= 0n ? (
        <Alert tone="info">Esta compra ya se encuentra pagada en su totalidad.</Alert>
      ) : (
        <PayPurchaseForm
          goodsReceiptId={receipt.id}
          receiptNumber={receipt.number}
          supplierName={receipt.supplierName}
          currency={currency}
          defaultExchangeRate={defaultExchangeRate}
          totalFormatted={`${formatMinorDecimal(totalMinor)} ${currency}`}
          paidFormatted={`${formatMinorDecimal(paidMinor)} ${currency}`}
          remainingDecimal={formatMinorDecimal(remainingMinor)}
          assetAccounts={assetAccounts}
          installments={receiptWithInstallments.installments ?? []}
        />
      )}
    </Screen>
  );
}
