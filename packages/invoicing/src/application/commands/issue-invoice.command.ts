import { Money, Quantity, type Currency, ok, err, type Result } from '@corebiz/shared-kernel';
import { TaxRate } from '@corebiz/fiscal/domain';
import {
  JournalEntry,
  JournalEntryLine,
  type JournalEntryRepository,
} from '@corebiz/accounting/domain';
import {
  Invoice,
  InvoiceLine,
  type InvoiceType,
  type FiscalControlData,
  type InvoiceRepository,
} from '../../domain/index';

export interface InvoiceLineCreationInput {
  readonly id: string;
  readonly description: string;
  readonly quantity: number | string;
  readonly unitPriceMinor: bigint;
  readonly taxPercentage: number;
  readonly productId?: string | undefined;
  readonly revenueAccountId?: string | undefined;
}

export interface IssueInvoiceCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly documentType: InvoiceType;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly fiscalControl?: FiscalControlData | undefined;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly currency: Currency;
  readonly receivableAccountId: string;
  readonly revenueAccountId: string;
  readonly taxPayableAccountId: string;
  readonly lines: readonly InvoiceLineCreationInput[];
}

export interface IssueInvoiceError {
  readonly kind:
    'InvalidLineInput' | 'InvoiceCreationError' | 'JournalEntryError' | 'EmptyInvoiceLines';
  readonly details?: string | undefined;
}

export class IssueInvoiceCommandHandler {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(
    command: IssueInvoiceCommand,
  ): Promise<Result<{ invoiceId: string; journalEntryId: string }, IssueInvoiceError>> {
    if (command.lines.length === 0) {
      return err({ kind: 'EmptyInvoiceLines' });
    }

    const domainLines: InvoiceLine[] = [];

    for (const lineInput of command.lines) {
      const qtyResult = Quantity.of(lineInput.quantity);
      const taxRateResult = TaxRate.fromPercentage(lineInput.taxPercentage);

      if (!qtyResult.ok || !taxRateResult.ok) {
        return err({ kind: 'InvalidLineInput', details: 'Invalid quantity or tax rate' });
      }

      const lineResult = InvoiceLine.create(
        lineInput.id,
        lineInput.description,
        qtyResult.value,
        Money.fromMinor(lineInput.unitPriceMinor, command.currency),
        taxRateResult.value,
        lineInput.productId,
        lineInput.revenueAccountId,
      );

      if (!lineResult.ok) {
        return err({ kind: 'InvalidLineInput', details: lineResult.error.kind });
      }

      domainLines.push(lineResult.value);
    }

    const invoiceResult = Invoice.create({
      id: command.id,
      tenantId: command.tenantId,
      customerId: command.customerId,
      documentType: command.documentType,
      documentNumber: command.documentNumber,
      controlNumber: command.controlNumber,
      fiscalControl: command.fiscalControl,
      issueDate: command.issueDate,
      dueDate: command.dueDate,
      lines: domainLines,
    });

    if (!invoiceResult.ok) {
      return err({ kind: 'InvoiceCreationError', details: invoiceResult.error.kind });
    }

    const invoice = invoiceResult.value;

    const debitReceivableLine = JournalEntryLine.create(
      command.receivableAccountId,
      invoice.total,
      Money.zero(command.currency),
      `Accounts receivable - Invoice ${command.documentNumber}`,
    );

    if (!debitReceivableLine.ok) {
      return err({
        kind: 'JournalEntryError',
        details: 'Failed to create receivable journal line',
      });
    }

    const revenueByAccount = new Map<string, bigint>();

    for (let i = 0; i < invoice.lines.length; i++) {
      const line = invoice.lines[i];
      const inputLine = command.lines[i];
      if (!line) continue;
      const targetAccount = inputLine?.revenueAccountId?.trim() || command.revenueAccountId;
      const currentMinor = revenueByAccount.get(targetAccount) ?? 0n;
      revenueByAccount.set(targetAccount, currentMinor + line.subtotal.minorUnits);
    }

    const revenueLines: JournalEntryLine[] = [];
    for (const [accountId, totalMinor] of revenueByAccount.entries()) {
      const revenueMoney = Money.fromMinor(totalMinor, command.currency);
      const creditRevenueLine = JournalEntryLine.create(
        accountId,
        Money.zero(command.currency),
        revenueMoney,
        `Sales revenue - Invoice ${command.documentNumber}`,
      );
      if (!creditRevenueLine.ok) {
        return err({ kind: 'JournalEntryError', details: 'Failed to create revenue journal line' });
      }
      revenueLines.push(creditRevenueLine.value);
    }

    const journalLines: JournalEntryLine[] = [debitReceivableLine.value, ...revenueLines];

    if (invoice.taxTotal.isPositive) {
      const creditTaxLine = JournalEntryLine.create(
        command.taxPayableAccountId,
        Money.zero(command.currency),
        invoice.taxTotal,
        `Tax payable - Invoice ${command.documentNumber}`,
      );
      if (!creditTaxLine.ok) {
        return err({ kind: 'JournalEntryError', details: 'Failed to create tax line' });
      }
      journalLines.push(creditTaxLine.value);
    }

    const entryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const journalEntryResult = JournalEntry.create({
      id: `je-${command.id}`,
      tenantId: command.tenantId,
      entryNumber,
      date: command.issueDate,
      description: `Auto journal entry for Invoice ${command.documentNumber}`,
      sourceType: 'INVOICE',
      sourceId: command.id,
      lines: journalLines,
    });

    if (!journalEntryResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalEntryResult.error.kind });
    }

    await this.invoiceRepository.save(invoice);
    await this.journalEntryRepository.save(journalEntryResult.value);

    return ok({ invoiceId: invoice.id, journalEntryId: journalEntryResult.value.id });
  }
}
