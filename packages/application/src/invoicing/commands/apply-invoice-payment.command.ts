import {
  Money,
  JournalEntry,
  JournalEntryLine,
  type Currency,
  type InvoiceRepository,
  type JournalEntryRepository,
  ok,
  err,
  type Result,
} from '@corebiz/domain';

export interface ApplyInvoicePaymentCommand {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly amountMinor: bigint;
  readonly currency: Currency;
  readonly paymentDate: Date;
  readonly cashAccountId: string;
  readonly receivableAccountId: string;
  readonly reference?: string | undefined;
}

export interface ApplyInvoicePaymentError {
  readonly kind: 'InvoiceNotFound' | 'PaymentError' | 'JournalEntryError';
  readonly details?: string | undefined;
}

export class ApplyInvoicePaymentCommandHandler {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: ApplyInvoicePaymentCommand,
  ): Promise<
    Result<{ invoiceId: string; remainingBalanceMinor: bigint }, ApplyInvoicePaymentError>
  > {
    const invoice = await this.invoiceRepository.findById(command.tenantId, command.invoiceId);
    if (!invoice) {
      return err({ kind: 'InvoiceNotFound' });
    }

    const paymentMoney = Money.fromMinor(command.amountMinor, command.currency);
    const paidResult = invoice.applyPayment(paymentMoney);
    if (!paidResult.ok) {
      return err({ kind: 'PaymentError', details: paidResult.error.kind });
    }

    const updatedInvoice = paidResult.value;

    const debitCashLine = JournalEntryLine.create(
      command.cashAccountId,
      paymentMoney,
      Money.zero(command.currency),
      `Cash received - Invoice ${invoice.documentNumber}`,
    );

    const creditReceivableLine = JournalEntryLine.create(
      command.receivableAccountId,
      Money.zero(command.currency),
      paymentMoney,
      `Receivable collection - Invoice ${invoice.documentNumber}`,
    );

    if (!debitCashLine.ok || !creditReceivableLine.ok) {
      return err({ kind: 'JournalEntryError', details: 'Invalid payment lines' });
    }

    const entryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const journalEntryResult = JournalEntry.create({
      id: `pay-je-${command.invoiceId}-${entryNumber}`,
      tenantId: command.tenantId,
      entryNumber,
      date: command.paymentDate,
      description: `Collection entry for Invoice ${invoice.documentNumber}`,
      sourceType: 'PAYMENT',
      sourceId: command.invoiceId,
      lines: [debitCashLine.value, creditReceivableLine.value],
    });

    if (!journalEntryResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalEntryResult.error.kind });
    }

    await this.invoiceRepository.save(updatedInvoice);
    await this.journalEntryRepository.save(journalEntryResult.value);

    return ok({
      invoiceId: updatedInvoice.id,
      remainingBalanceMinor: updatedInvoice.remainingBalance.minorUnits,
    });
  }
}
