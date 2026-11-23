import { describe, expect, it } from 'vitest';
import type {
  Invoice,
  InvoiceRepository,
  JournalEntry,
  JournalEntryRepository,
} from '@corebiz/domain';
import { IssueInvoiceCommandHandler } from '../../src/invoicing/commands/issue-invoice.command';

class MockInvoiceRepo implements InvoiceRepository {
  invoices: Invoice[] = [];

  findById(_tenantId: string, id: string): Promise<Invoice | null> {
    return Promise.resolve(this.invoices.find((i) => i.id === id) ?? null);
  }
  findByNumber(_tenantId: string, _type: string, number: string): Promise<Invoice | null> {
    return Promise.resolve(this.invoices.find((i) => i.documentNumber === number) ?? null);
  }
  listByCustomer(_tenantId: string, customerId: string): Promise<readonly Invoice[]> {
    return Promise.resolve(this.invoices.filter((i) => i.customerId === customerId));
  }
  save(invoice: Invoice): Promise<void> {
    this.invoices.push(invoice);
    return Promise.resolve();
  }
}

class MockJournalRepoForInvoice implements JournalEntryRepository {
  entries: JournalEntry[] = [];
  nextNum = 1n;

  findById(_tenantId: string, id: string): Promise<JournalEntry | null> {
    return Promise.resolve(this.entries.find((e) => e.id === id) ?? null);
  }
  nextEntryNumber(_tenantId: string): Promise<bigint> {
    const n = this.nextNum;
    this.nextNum += 1n;
    return Promise.resolve(n);
  }
  save(entry: JournalEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  listByDateRange(
    _tenantId: string,
    _startDate: Date,
    _endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    return Promise.resolve(this.entries);
  }
}

describe('IssueInvoiceCommandHandler Use Case', () => {
  it('issues invoice and posts balanced double-entry journal voucher', async () => {
    const invoiceRepo = new MockInvoiceRepo();
    const journalRepo = new MockJournalRepoForInvoice();
    const handler = new IssueInvoiceCommandHandler(invoiceRepo, journalRepo);

    const result = await handler.execute({
      id: 'inv-100',
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      documentType: 'STANDARD',
      documentNumber: 'FACT-00100',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      currency: 'USD',
      receivableAccountId: 'acc-cxc',
      revenueAccountId: 'acc-ingresos',
      taxPayableAccountId: 'acc-iva-debito',
      lines: [
        {
          id: 'l-1',
          description: 'Consulting',
          quantity: 1,
          unitPriceMinor: 10000n,
          taxPercentage: 16,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(invoiceRepo.invoices).toHaveLength(1);
      const savedInvoice = invoiceRepo.invoices[0];
      expect(savedInvoice?.total.minorUnits).toBe(11600n);
      expect(savedInvoice?.subtotal.minorUnits).toBe(10000n);
      expect(savedInvoice?.taxTotal.minorUnits).toBe(3200n / 2n);

      expect(journalRepo.entries).toHaveLength(1);
      const savedJournal = journalRepo.entries[0];
      expect(savedJournal?.totalDebit).toBe(11600n);
      expect(savedJournal?.totalCredit).toBe(11600n);
    }
  });
});
