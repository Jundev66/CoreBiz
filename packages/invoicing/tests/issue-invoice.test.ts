import { describe, expect, it } from 'vitest';
import {
  IssueInvoiceCommandHandler,
  type IssueInvoiceCommand,
} from '../src/application/commands/issue-invoice.command';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';

describe('IssueInvoiceCommandHandler', () => {
  it('issues invoice and posts balanced accounts receivable journal entry', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new IssueInvoiceCommandHandler(invoiceRepo, journalRepo);

    const command: IssueInvoiceCommand = {
      id: 'inv-cmd-01',
      tenantId: 'tenant-test-01',
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-00100',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      currency: 'USD',
      receivableAccountId: 'acc-ar-01',
      revenueAccountId: 'acc-rev-01',
      taxPayableAccountId: 'acc-tax-01',
      lines: [
        {
          id: 'l-01',
          description: 'Consulting Services',
          quantity: 1,
          unitPriceMinor: 10000n,
          taxPercentage: 16,
        },
      ],
    };

    const result = await handler.execute(command);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const persistedInvoice = await invoiceRepo.findById('tenant-test-01', 'inv-cmd-01');
      expect(persistedInvoice).not.toBeNull();
      expect(persistedInvoice?.total.minorUnits).toBe(11600n);
      expect(persistedInvoice?.subtotal.minorUnits).toBe(10000n);
      expect(persistedInvoice?.taxTotal.minorUnits).toBe(1600n);

      const persistedJournal = await journalRepo.findById(
        'tenant-test-01',
        result.value.journalEntryId,
      );
      expect(persistedJournal).not.toBeNull();
      expect(persistedJournal?.totalDebit).toBe(11600n);
      expect(persistedJournal?.totalCredit).toBe(11600n);
    }
  });

  it('rejects issuance when line inputs are empty', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new IssueInvoiceCommandHandler(invoiceRepo, journalRepo);

    const result = await handler.execute({
      id: 'inv-empty',
      tenantId: 'tenant-test-01',
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-EMPTY',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      currency: 'USD',
      receivableAccountId: 'acc-ar-01',
      revenueAccountId: 'acc-rev-01',
      taxPayableAccountId: 'acc-tax-01',
      lines: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('EmptyInvoiceLines');
    }
  });
});
