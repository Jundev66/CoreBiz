import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import {
  JournalEntry,
  JournalEntryLine,
  type JournalEntryRepository,
} from '@corebiz/accounting/domain';
import type { InvoiceRepository } from '../../domain/port/invoice-repository';
import type { PaymentReceiptRepository } from '../../domain/port/payment-receipt-repository';

export interface VoidCollectionReceiptCommand {
  readonly tenantId: string;
  readonly receiptId: string;
  readonly reason: string;
  readonly bankAccountId: string;
  readonly receivableAccountId: string;
  readonly voidedAt: Date;
}

export interface VoidCollectionReceiptError {
  readonly kind:
    | 'ReceiptNotFound'
    | 'ReceiptAlreadyVoided'
    | 'InvoiceNotFound'
    | 'VoidError'
    | 'JournalEntryError';
  readonly details?: string | undefined;
}

export class VoidCollectionReceiptCommandHandler {
  constructor(
    private readonly receiptRepository: PaymentReceiptRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: VoidCollectionReceiptCommand,
  ): Promise<Result<{ receiptId: string; journalEntryId: string }, VoidCollectionReceiptError>> {
    const receipt = await this.receiptRepository.findById(command.tenantId, command.receiptId);
    if (!receipt) {
      return err({ kind: 'ReceiptNotFound' });
    }

    if (receipt.status === 'VOIDED') {
      return err({ kind: 'ReceiptAlreadyVoided' });
    }

    const voidResult = receipt.void(command.reason, command.voidedAt);
    if (!voidResult.ok) {
      return err({ kind: 'VoidError', details: voidResult.error.kind });
    }
    const voidedReceipt = voidResult.value;

    for (const alloc of receipt.allocations) {
      const invoice = await this.invoiceRepository.findById(command.tenantId, alloc.invoiceId);
      if (!invoice) {
        return err({
          kind: 'InvoiceNotFound',
          details: `Invoice ${alloc.invoiceId} not found during voiding`,
        });
      }

      const restoreResult = invoice.restorePayment(alloc.amount);
      if (!restoreResult.ok) {
        return err({ kind: 'VoidError', details: restoreResult.error.kind });
      }

      await this.invoiceRepository.save(restoreResult.value);
    }

    const debitReceivableLine = JournalEntryLine.create(
      command.receivableAccountId,
      receipt.amount,
      Money.zero(receipt.amount.currency),
      `Accounts receivable restoration - Voided receipt ${receipt.receiptNumber}`,
    );

    const creditCashLine = JournalEntryLine.create(
      command.bankAccountId,
      Money.zero(receipt.amount.currency),
      receipt.amount,
      `Cash refund / reversal - Voided receipt ${receipt.receiptNumber}`,
    );

    if (!debitReceivableLine.ok || !creditCashLine.ok) {
      return err({
        kind: 'JournalEntryError',
        details: 'Failed to create reversal journal lines',
      });
    }

    const entryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const journalEntryResult = JournalEntry.create({
      id: `void-rc-je-${receipt.id}-${entryNumber}`,
      tenantId: command.tenantId,
      entryNumber,
      date: command.voidedAt,
      description: `Reversal entry for voided receipt ${receipt.receiptNumber}`,
      sourceType: 'PAYMENT',
      sourceId: receipt.id,
      lines: [debitReceivableLine.value, creditCashLine.value],
    });

    if (!journalEntryResult.ok) {
      return err({
        kind: 'JournalEntryError',
        details: journalEntryResult.error.kind,
      });
    }

    await this.receiptRepository.save(voidedReceipt);
    await this.journalEntryRepository.save(journalEntryResult.value);

    return ok({
      receiptId: voidedReceipt.id,
      journalEntryId: journalEntryResult.value.id,
    });
  }
}
