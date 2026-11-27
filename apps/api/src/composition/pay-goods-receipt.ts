import { can, err, Money, ok, type Currency, type Result } from '@corebiz/domain';
import {
  createDefaultAccountsForJurisdiction,
  JournalEntry,
  JournalEntryLine,
  type AccountRepository,
  type JournalEntryRepository,
} from '@corebiz/accounting';
import type { PurchasingQueries, TenantContext } from '@corebiz/application';

export interface PayGoodsReceiptCommand {
  readonly receiptId: string;
  readonly amountMinor: bigint;
  readonly currency: Currency;
  readonly paymentDate: Date;
  readonly sourceAccountId: string;
  readonly payableAccountId?: string | undefined;
  readonly reference?: string | undefined;
}

export type PayGoodsReceiptError =
  | { readonly kind: 'Forbidden' }
  | { readonly kind: 'GoodsReceiptNotFound'; readonly receiptId: string }
  | { readonly kind: 'GoodsReceiptVoided' }
  | { readonly kind: 'InvalidSourceAccount' }
  | { readonly kind: 'InvalidPayableAccount' }
  | { readonly kind: 'AlreadyPaid' }
  | { readonly kind: 'InvalidAmount' }
  | { readonly kind: 'PaymentExceedsRemainingBalance'; readonly remainingMinor: bigint }
  | { readonly kind: 'JournalEntryError'; readonly details?: string };

export interface PayGoodsReceiptOutput {
  readonly receiptId: string;
  readonly journalEntryId: string;
  readonly paidMinor: string;
  readonly remainingBalanceMinor: string;
}

export function makePayGoodsReceipt(deps: {
  readonly ctx: TenantContext;
  readonly purchasingQueries: PurchasingQueries;
  readonly accounts: AccountRepository;
  readonly journalEntries: JournalEntryRepository;
}) {
  return async function payGoodsReceipt(
    input: PayGoodsReceiptCommand,
  ): Promise<Result<PayGoodsReceiptOutput, PayGoodsReceiptError>> {
    if (!can(deps.ctx.actor, 'purchase:receive')) {
      return err({ kind: 'Forbidden' });
    }

    if (input.amountMinor <= 0n) {
      return err({ kind: 'InvalidAmount' });
    }

    const receipt = await deps.purchasingQueries.receiptById(input.receiptId);
    if (!receipt) {
      return err({ kind: 'GoodsReceiptNotFound', receiptId: input.receiptId });
    }

    if (receipt.status === 'voided') {
      return err({ kind: 'GoodsReceiptVoided' });
    }

    const sourceAccount = await deps.accounts.findById(deps.ctx.tenantId, input.sourceAccountId);
    if (!sourceAccount || !sourceAccount.isActive || sourceAccount.category !== 'ASSET') {
      return err({ kind: 'InvalidSourceAccount' });
    }

    let accounts = await deps.accounts.listByTenant(deps.ctx.tenantId).catch(() => []);
    if (accounts.length === 0) {
      const seeded = createDefaultAccountsForJurisdiction(
        deps.ctx.tenantId,
        deps.ctx.settings.fiscalCountry ?? 'VE',
      );
      for (const acc of seeded) {
        await deps.accounts.save(acc).catch(() => {});
      }
      accounts = seeded;
    }

    const payableAccount = input.payableAccountId
      ? await deps.accounts.findById(deps.ctx.tenantId, input.payableAccountId)
      : (accounts.find((a) => a.code.value === '2.1.01' || a.code.value === '2010') ??
        accounts.find((a) => a.category === 'LIABILITY'));

    if (!payableAccount || !payableAccount.isActive || payableAccount.category !== 'LIABILITY') {
      return err({ kind: 'InvalidPayableAccount' });
    }

    const allEntries = await deps.journalEntries.listByDateRange(
      deps.ctx.tenantId,
      new Date(0),
      new Date(Date.now() + 365 * 86_400_000),
    );
    const receiptEntries = allEntries.filter((e) => e.sourceId === receipt.id);
    const purchaseEntry = receiptEntries.find((e) => e.sourceType === 'PURCHASE');

    if (purchaseEntry) {
      const creditsPayable = purchaseEntry.lines.some(
        (l) => l.accountId === payableAccount.id && l.credit.minorUnits > 0n,
      );
      if (!creditsPayable) {
        return err({ kind: 'AlreadyPaid' });
      }
    }

    const parsedReceiptTotal = Money.of(receipt.total, input.currency);
    const totalMinor = purchaseEntry
      ? purchaseEntry.totalCredit
      : parsedReceiptTotal.ok
        ? parsedReceiptTotal.value.minorUnits
        : 0n;

    const previouslyPaidMinor = receiptEntries
      .filter((e) => e.sourceType === 'PAYMENT')
      .reduce((acc, e) => acc + e.totalDebit, 0n);

    const remainingMinor = totalMinor - previouslyPaidMinor;
    if (remainingMinor <= 0n) {
      return err({ kind: 'AlreadyPaid' });
    }

    if (input.amountMinor > remainingMinor) {
      return err({ kind: 'PaymentExceedsRemainingBalance', remainingMinor });
    }

    const paymentMoney = Money.fromMinor(input.amountMinor, input.currency);
    const refNote = input.reference ? ` (${input.reference})` : '';
    const docRef = receipt.supplierReference || receipt.number;

    const debitPayable = JournalEntryLine.create(
      payableAccount.id,
      paymentMoney,
      Money.zero(input.currency),
      `Pago a proveedor - ${docRef}${refNote}`,
    );
    const creditAsset = JournalEntryLine.create(
      sourceAccount.id,
      Money.zero(input.currency),
      paymentMoney,
      `Salida desde ${sourceAccount.code.value} ${sourceAccount.name} - ${docRef}${refNote}`,
    );

    if (!debitPayable.ok || !creditAsset.ok) {
      return err({ kind: 'JournalEntryError', details: 'Invalid payment lines' });
    }

    const entryNumber = await deps.journalEntries.nextEntryNumber(deps.ctx.tenantId);
    const journalEntryResult = JournalEntry.create({
      id: crypto.randomUUID(),
      tenantId: deps.ctx.tenantId,
      entryNumber,
      date: input.paymentDate,
      description: `Pago a proveedor ${receipt.supplierName} - ${docRef}${refNote}`,
      sourceType: 'PAYMENT',
      sourceId: receipt.id,
      lines: [debitPayable.value, creditAsset.value],
    });

    if (!journalEntryResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalEntryResult.error.kind });
    }

    await deps.journalEntries.save(journalEntryResult.value);

    const newPaidMinor = previouslyPaidMinor + input.amountMinor;
    const newRemainingMinor = totalMinor - newPaidMinor;

    return ok({
      receiptId: receipt.id,
      journalEntryId: journalEntryResult.value.id,
      paidMinor: newPaidMinor.toString(),
      remainingBalanceMinor: newRemainingMinor.toString(),
    });
  };
}
