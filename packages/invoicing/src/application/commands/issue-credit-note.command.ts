import { Money, Quantity, ok, err, type Currency, type Result } from '@corebiz/shared-kernel';
import { TaxRate } from '@corebiz/fiscal/domain';
import { JournalEntry, JournalEntryLine, type JournalEntryRepository } from '@corebiz/accounting';
import {
  CreditNote,
  InvoiceLine,
  type InvoiceError,
  type CreditNoteReason,
  type CreditNoteError,
  type InvoiceRepository,
  type CreditNoteRepository,
} from '../../domain';

export interface CreditNoteLineCreationInput {
  readonly id: string;
  readonly description: string;
  readonly quantity: number | string;
  readonly unitPriceMinor: bigint;
  readonly taxPercentage: number;
  readonly productId?: string | undefined;
}

export interface IssueCreditNoteCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly affectedInvoiceId: string;
  readonly creditNoteNumber: string;
  readonly controlNumber?: string | undefined;
  readonly reason: CreditNoteReason;
  readonly reasonDetails?: string | undefined;
  readonly issueDate: Date;
  readonly currency?: Currency | undefined;
  readonly restockItems?: boolean | undefined;
  readonly warehouseId?: string | undefined;
  readonly receivableAccountId?: string | undefined;
  readonly returnsAccountId?: string | undefined;
  readonly taxPayableAccountId?: string | undefined;
  readonly lines: readonly CreditNoteLineCreationInput[];
}

export type IssueCreditNoteError =
  | CreditNoteError
  | InvoiceError
  | { readonly kind: 'InvoiceNotFound'; readonly invoiceId: string }
  | { readonly kind: 'InvalidLineInput'; readonly details: string }
  | { readonly kind: 'JournalEntryError'; readonly details: string };

export class IssueCreditNoteCommandHandler {
  constructor(
    private readonly creditNoteRepo: CreditNoteRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly journalEntryRepo?: JournalEntryRepository | undefined,
  ) {}

  async execute(command: IssueCreditNoteCommand): Promise<
    Result<
      {
        creditNoteId: string;
        creditNoteNumber: string;
        totalMinor: string;
      },
      IssueCreditNoteError
    >
  > {
    const invoice = await this.invoiceRepo.findById(command.tenantId, command.affectedInvoiceId);
    if (!invoice) {
      return err({ kind: 'InvoiceNotFound', invoiceId: command.affectedInvoiceId });
    }

    if (command.lines.length === 0) {
      return err({ kind: 'EmptyCreditNoteLines' });
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
        lineInput.productId,
      );

      if (!lineRes.ok) {
        return err({ kind: 'InvalidLineInput', details: lineRes.error.kind });
      }

      domainLines.push(lineRes.value);
    }

    const creditNoteRes = CreditNote.create({
      id: command.id,
      tenantId: command.tenantId,
      creditNoteNumber: command.creditNoteNumber,
      controlNumber: command.controlNumber,
      affectedInvoiceId: invoice.id,
      affectedDocumentNumber: invoice.documentNumber,
      customerId: invoice.customerId,
      reason: command.reason,
      reasonDetails: command.reasonDetails,
      issueDate: command.issueDate,
      restockItems: command.restockItems,
      warehouseId: command.warehouseId,
      lines: domainLines,
    });

    if (!creditNoteRes.ok) {
      return err(creditNoteRes.error);
    }

    const creditNote = creditNoteRes.value;

    const creditApplyRes = invoice.applyCredit(creditNote.total);
    if (!creditApplyRes.ok) {
      return err(creditApplyRes.error);
    }

    await this.invoiceRepo.save(creditApplyRes.value);

    if (this.journalEntryRepo) {
      const receivableAccountId = command.receivableAccountId ?? '1.1.02';
      const returnsAccountId = command.returnsAccountId ?? '4.1.01';
      const taxPayableAccountId = command.taxPayableAccountId ?? '2.1.02';

      const journalLines: JournalEntryLine[] = [];

      const debitReturns = JournalEntryLine.create(
        returnsAccountId,
        creditNote.subtotal,
        Money.zero(currency),
        `Sales Return / Allowance - Credit Note ${creditNote.creditNoteNumber}`,
      );
      if (!debitReturns.ok) {
        return err({
          kind: 'JournalEntryError',
          details: 'Failed to create sales return debit line',
        });
      }
      journalLines.push(debitReturns.value);

      if (creditNote.taxTotal.isPositive) {
        const debitTax = JournalEntryLine.create(
          taxPayableAccountId,
          creditNote.taxTotal,
          Money.zero(currency),
          `Fiscal Debit Tax Reversal - Credit Note ${creditNote.creditNoteNumber}`,
        );
        if (!debitTax.ok) {
          return err({ kind: 'JournalEntryError', details: 'Failed to create tax debit line' });
        }
        journalLines.push(debitTax.value);
      }

      const creditReceivable = JournalEntryLine.create(
        receivableAccountId,
        Money.zero(currency),
        creditNote.total,
        `Accounts Receivable reduction - Credit Note ${creditNote.creditNoteNumber}`,
      );
      if (!creditReceivable.ok) {
        return err({
          kind: 'JournalEntryError',
          details: 'Failed to create receivable credit line',
        });
      }
      journalLines.push(creditReceivable.value);

      const entryNumber = await this.journalEntryRepo.nextEntryNumber(command.tenantId);
      const journalEntryRes = JournalEntry.create({
        id: `${creditNote.id}-journal`,
        tenantId: command.tenantId,
        entryNumber,
        date: command.issueDate,
        description: `Credit Note ${creditNote.creditNoteNumber} against ${invoice.documentNumber}`,
        sourceType: 'INVOICE',
        sourceId: creditNote.id,
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

    await this.creditNoteRepo.save(creditNote);

    return ok({
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.creditNoteNumber,
      totalMinor: creditNote.total.minorUnits.toString(),
    });
  }
}
