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

  it('allocates revenue to specific item accounts and falls back to company revenue account for lines without override', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new IssueInvoiceCommandHandler(invoiceRepo, journalRepo);

    const command: IssueInvoiceCommand = {
      id: 'inv-multi-acc-01',
      tenantId: 'tenant-test-01',
      customerId: 'cust-test-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-00200',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      currency: 'USD',
      receivableAccountId: 'acc-ar-01',
      revenueAccountId: 'acc-company-fallback-rev',
      taxPayableAccountId: 'acc-tax-01',
      lines: [
        {
          id: 'l-01',
          description: 'Physical Goods Item A',
          quantity: 2,
          unitPriceMinor: 5000n,
          taxPercentage: 16,
          revenueAccountId: 'acc-item-goods-rev',
        },
        {
          id: 'l-02',
          description: 'Consulting Fee B (Uses Company Fallback)',
          quantity: 1,
          unitPriceMinor: 4000n,
          taxPercentage: 16,
        },
        {
          id: 'l-03',
          description: 'Physical Goods Item C (Shares item-goods-rev)',
          quantity: 1,
          unitPriceMinor: 6000n,
          taxPercentage: 16,
          revenueAccountId: 'acc-item-goods-rev',
        },
      ],
    };

    const result = await handler.execute(command);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const journal = await journalRepo.findById('tenant-test-01', result.value.journalEntryId);
    expect(journal).not.toBeNull();
    if (!journal) return;

    expect(journal.totalDebit).toBe(journal.totalCredit);

    const debitLine = journal.lines.find((l) => l.accountId === 'acc-ar-01');
    expect(debitLine?.debit.minorUnits).toBe(23200n);

    const goodsRevLine = journal.lines.find((l) => l.accountId === 'acc-item-goods-rev');
    expect(goodsRevLine?.credit.minorUnits).toBe(16000n);

    const fallbackRevLine = journal.lines.find((l) => l.accountId === 'acc-company-fallback-rev');
    expect(fallbackRevLine?.credit.minorUnits).toBe(4000n);

    const taxLine = journal.lines.find((l) => l.accountId === 'acc-tax-01');
    expect(taxLine?.credit.minorUnits).toBe(3200n);

    expect(journal.lines).toHaveLength(4);
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
