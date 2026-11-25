import { Money, type Currency, ok, err, type Result } from '@corebiz/shared-kernel';
import {
  JournalEntry,
  JournalEntryLine,
  type JournalEntryRepository,
} from '@corebiz/accounting/domain';
import {
  type Invoice,
  PaymentReceipt,
  type InvoicePaymentMethod,
  type PaymentReceiptAllocation,
  type InvoiceRepository,
  type PaymentReceiptRepository,
} from '../../domain/index';

export interface CollectionAllocationInput {
  readonly invoiceId: string;
  readonly amountMinor: bigint;
}

export interface CreateCollectionReceiptCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly amountMinor: bigint;
  readonly currency: Currency;
  readonly paymentMethod: InvoicePaymentMethod;
  readonly bankAccountId: string;
  readonly receivableAccountId: string;
  readonly receiptDate: Date;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
  readonly allocations: readonly CollectionAllocationInput[];
}

export interface CreateCollectionReceiptError {
  readonly kind:
    | 'EmptyAllocations'
    | 'InvalidAmount'
    | 'AllocationSumMismatch'
    | 'InvoiceNotFound'
    | 'InvoiceCurrencyMismatch'
    | 'AllocationExceedsBalance'
    | 'ReceiptCreationError'
    | 'JournalEntryError';
  readonly details?: string | undefined;
}

export class CreateCollectionReceiptCommandHandler {
  constructor(
    private readonly receiptRepository: PaymentReceiptRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(command: CreateCollectionReceiptCommand): Promise<
    Result<
      {
        receiptId: string;
        receiptNumber: string;
        journalEntryId: string;
      },
      CreateCollectionReceiptError
    >
  > {
    if (command.amountMinor <= 0n) {
      return err({ kind: 'InvalidAmount', details: 'Receipt amount must be positive' });
    }

    if (command.allocations.length === 0) {
      return err({ kind: 'EmptyAllocations', details: 'At least one allocation is required' });
    }

    let sumAllocations = 0n;
    for (const a of command.allocations) {
      sumAllocations += a.amountMinor;
    }

    if (sumAllocations !== command.amountMinor) {
      return err({
        kind: 'AllocationSumMismatch',
        details: 'Sum of allocations must strictly match total receipt amount',
      });
    }

    const domainAllocations: PaymentReceiptAllocation[] = [];
    const updatedInvoices: Invoice[] = [];

    for (const allocInput of command.allocations) {
      const invoice = await this.invoiceRepository.findById(command.tenantId, allocInput.invoiceId);

      if (!invoice) {
        return err({
          kind: 'InvoiceNotFound',
          details: `Invoice ${allocInput.invoiceId} not found`,
        });
      }

      if (invoice.total.currency !== command.currency) {
        return err({
          kind: 'InvoiceCurrencyMismatch',
          details: `Invoice ${invoice.documentNumber} currency mismatch`,
        });
      }

      const allocMoney = Money.fromMinor(allocInput.amountMinor, command.currency);
      if (allocMoney.minorUnits > invoice.remainingBalance.minorUnits) {
        return err({
          kind: 'AllocationExceedsBalance',
          details: `Allocation of ${allocMoney.minorUnits} exceeds remaining balance of ${invoice.remainingBalance.minorUnits}`,
        });
      }

      const prevBalance = invoice.remainingBalance;
      const applyResult = invoice.applyPayment(allocMoney);
      if (!applyResult.ok) {
        return err({
          kind: 'AllocationExceedsBalance',
          details: applyResult.error.kind,
        });
      }

      const updatedInvoice = applyResult.value;
      updatedInvoices.push(updatedInvoice);

      domainAllocations.push({
        invoiceId: invoice.id,
        amount: allocMoney,
        previousBalance: prevBalance,
        newBalance: updatedInvoice.remainingBalance,
      });
    }

    const receiptNumber = await this.receiptRepository.nextReceiptNumber(command.tenantId);
    const receiptMoney = Money.fromMinor(command.amountMinor, command.currency);

    const receiptResult = PaymentReceipt.create({
      id: command.id,
      tenantId: command.tenantId,
      receiptNumber,
      customerId: command.customerId,
      amount: receiptMoney,
      paymentMethod: command.paymentMethod,
      bankAccountId: command.bankAccountId,
      receiptDate: command.receiptDate,
      reference: command.reference,
      notes: command.notes,
      allocations: domainAllocations,
    });

    if (!receiptResult.ok) {
      return err({
        kind: 'ReceiptCreationError',
        details: receiptResult.error.kind,
      });
    }

    const receipt = receiptResult.value;

    const debitCashLine = JournalEntryLine.create(
      command.bankAccountId,
      receiptMoney,
      Money.zero(command.currency),
      `Collection receipt ${receiptNumber} - ${command.paymentMethod}`,
    );

    const creditReceivableLine = JournalEntryLine.create(
      command.receivableAccountId,
      Money.zero(command.currency),
      receiptMoney,
      `Accounts receivable payment - Receipt ${receiptNumber}`,
    );

    if (!debitCashLine.ok || !creditReceivableLine.ok) {
      return err({
        kind: 'JournalEntryError',
        details: 'Failed to create collection journal lines',
      });
    }

    const entryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const journalEntryResult = JournalEntry.create({
      id: `rc-je-${receipt.id}-${entryNumber}`,
      tenantId: command.tenantId,
      entryNumber,
      date: command.receiptDate,
      description: `Collection receipt ${receiptNumber} entry`,
      sourceType: 'PAYMENT',
      sourceId: receipt.id,
      lines: [debitCashLine.value, creditReceivableLine.value],
    });

    if (!journalEntryResult.ok) {
      return err({
        kind: 'JournalEntryError',
        details: journalEntryResult.error.kind,
      });
    }

    for (const inv of updatedInvoices) {
      await this.invoiceRepository.save(inv);
    }
    await this.receiptRepository.save(receipt);
    await this.journalEntryRepository.save(journalEntryResult.value);

    return ok({
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      journalEntryId: journalEntryResult.value.id,
    });
  }
}
