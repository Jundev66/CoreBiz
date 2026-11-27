import { Money, Quantity, ok, err, type Currency, type Result } from '@corebiz/shared-kernel';
import { TaxRate } from '@corebiz/fiscal/domain';
import { JournalEntry, JournalEntryLine, type JournalEntryRepository } from '@corebiz/accounting';
import {
  DebitNote,
  InvoiceLine,
  type DebitNoteReason,
  type DebitNoteError,
  type InvoiceRepository,
  type DebitNoteRepository,
} from '../../domain';

export interface DebitNoteLineCreationInput {
  readonly id: string;
  readonly description: string;
  readonly quantity: number | string;
  readonly unitPriceMinor: bigint;
  readonly taxPercentage: number;
}

export interface IssueDebitNoteCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly affectedInvoiceId: string;
  readonly debitNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly reason: DebitNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly currency?: Currency | undefined;
  readonly receivableAccountId?: string | undefined;
  readonly revenueAccountId?: string | undefined;
  readonly taxPayableAccountId?: string | undefined;
  readonly lines: readonly DebitNoteLineCreationInput[];
}

export type IssueDebitNoteError =
  | DebitNoteError
  | { readonly kind: 'InvoiceNotFound'; readonly invoiceId: string }
  | { readonly kind: 'CannotDebitVoidInvoice' }
  | { readonly kind: 'InvalidLineInput'; readonly details: string }
  | { readonly kind: 'JournalEntryError'; readonly details: string };

export class IssueDebitNoteCommandHandler {
  constructor(
    private readonly debitNoteRepo: DebitNoteRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly journalEntryRepo?: JournalEntryRepository | undefined,
  ) {}

  async execute(command: IssueDebitNoteCommand): Promise<
    Result<
      {
        debitNoteId: string;
        debitNoteNumber: string;
        totalMinor: string;
      },
      IssueDebitNoteError
    >
  > {
    const invoice = await this.invoiceRepo.findById(command.tenantId, command.affectedInvoiceId);
    if (!invoice) {
      return err({ kind: 'InvoiceNotFound', invoiceId: command.affectedInvoiceId });
    }

    if (invoice.status === 'VOID') {
      return err({ kind: 'CannotDebitVoidInvoice' });
    }

    if (command.lines.length === 0) {
      return err({ kind: 'EmptyDebitNoteLines' });
    }

    const currency = command.currency ?? invoice.total.currency;

    const domainLines: InvoiceLine[] = [];
    for (const lineInput of command.lines) {
      const qtyRes = Quantity.of(lineInput.quantity);
      const taxRateRes = TaxRate.fromPercentage(lineInput.taxPercentage);

      if (!qtyRes.ok || !taxRateRes.ok) {
        return err({ kind: 'InvalidLineInput', details: 'Invalid quantity or tax rate' });
      }

      const lineRes = InvoiceLine.create(
        lineInput.id,
        lineInput.description,
        qtyRes.value,
        Money.fromMinor(lineInput.unitPriceMinor, currency),
        taxRateRes.value,
      );

      if (!lineRes.ok) {
        return err({ kind: 'InvalidLineInput', details: lineRes.error.kind });
      }

      domainLines.push(lineRes.value);
    }

    const debitNoteRes = DebitNote.create({
      id: command.id,
      tenantId: command.tenantId,
      debitNoteNumber: command.debitNoteNumber,
      controlNumber: command.controlNumber,
      affectedInvoiceId: invoice.id,
      affectedDocumentNumber: invoice.documentNumber,
      customerId: invoice.customerId,
      reason: command.reason,
      reasonDetails: command.reasonDetails,
      issueDate: command.issueDate,
      lines: domainLines,
    });

    if (!debitNoteRes.ok) {
      return err(debitNoteRes.error);
    }

    const debitNote = debitNoteRes.value;

    if (this.journalEntryRepo) {
      const receivableAccountId = command.receivableAccountId ?? '1.1.02';
      const revenueAccountId = command.revenueAccountId ?? '4.1.01';
      const taxPayableAccountId = command.taxPayableAccountId ?? '2.1.02';

      const journalLines: JournalEntryLine[] = [];

      const debitReceivable = JournalEntryLine.create(
        receivableAccountId,
        debitNote.total,
        Money.zero(currency),
        `Accounts Receivable surcharge - Debit Note ${debitNote.debitNoteNumber}`,
      );
      if (!debitReceivable.ok) {
        return err({
          kind: 'JournalEntryError',
          details: 'Failed to create receivable debit line',
        });
      }
      journalLines.push(debitReceivable.value);

      const creditRevenue = JournalEntryLine.create(
        revenueAccountId,
        Money.zero(currency),
        debitNote.subtotal,
        `Surcharge Revenue - Debit Note ${debitNote.debitNoteNumber}`,
      );
      if (!creditRevenue.ok) {
        return err({ kind: 'JournalEntryError', details: 'Failed to create revenue credit line' });
      }
      journalLines.push(creditRevenue.value);

      if (debitNote.taxTotal.isPositive) {
        const creditTax = JournalEntryLine.create(
          taxPayableAccountId,
          Money.zero(currency),
          debitNote.taxTotal,
          `Fiscal Debit Tax - Debit Note ${debitNote.debitNoteNumber}`,
        );
        if (!creditTax.ok) {
          return err({ kind: 'JournalEntryError', details: 'Failed to create tax credit line' });
        }
        journalLines.push(creditTax.value);
      }

      const entryNumber = await this.journalEntryRepo.nextEntryNumber(command.tenantId);
      const journalEntryRes = JournalEntry.create({
        id: crypto.randomUUID(),
        tenantId: command.tenantId,
        entryNumber,
        date: command.issueDate,
        description: `Debit Note ${debitNote.debitNoteNumber} against ${invoice.documentNumber}`,
        sourceType: 'INVOICE',
        sourceId: debitNote.id,
        lines: journalLines,
      });

      if (!journalEntryRes.ok) {
        return err({
          kind: 'JournalEntryError',
          details: 'Failed to create balanced journal entry',
        });
      }

      await this.journalEntryRepo.save(journalEntryRes.value);
    }

    await this.debitNoteRepo.save(debitNote);

    return ok({
      debitNoteId: debitNote.id,
      debitNoteNumber: debitNote.debitNoteNumber,
      totalMinor: debitNote.total.minorUnits.toString(),
    });
  }
}
