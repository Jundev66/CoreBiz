import { describe, expect, it } from 'vitest';
import {
  Quantity,
  TaxRate,
  Invoice,
  InvoiceLine,
  Money,
  type InvoiceRepository,
  type JournalEntry,
  type JournalEntryRepository,
} from '@corebiz/domain';
import { ApplyInvoicePaymentCommandHandler } from '../../src/invoicing/commands/apply-invoice-payment.command';

class MockInvoicePaymentRepo implements InvoiceRepository {
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
    const idx = this.invoices.findIndex((i) => i.id === invoice.id);
    if (idx >= 0) {
      this.invoices[idx] = invoice;
    } else {
      this.invoices.push(invoice);
    }
    return Promise.resolve();
  }
}

class MockJournalPaymentRepo implements JournalEntryRepository {
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

describe('ApplyInvoicePaymentCommandHandler Use Case', () => {
  it('applies payment, updates remaining balance to zero and creates payment journal entry', async () => {
    const invoiceRepo = new MockInvoicePaymentRepo();
    const journalRepo = new MockJournalPaymentRepo();

    const q = Quantity.of(1);
    if (q.ok) {
      const line = InvoiceLine.create(
        'l-1',
        'Product',
        q.value,
        Money.fromMinor(10000n, 'USD'),
        TaxRate.zero(),
      );
      if (line.ok) {
        const invoice = Invoice.create({
          id: 'inv-to-pay',
          tenantId: 'tenant-1',
          customerId: 'cust-1',
          documentType: 'STANDARD',
          documentNumber: 'FACT-00200',
          issueDate: new Date('2026-11-23'),
          dueDate: new Date('2026-12-23'),
          lines: [line.value],
        });

        if (invoice.ok) {
          await invoiceRepo.save(invoice.value);
        }
      }
    }

    const handler = new ApplyInvoicePaymentCommandHandler(invoiceRepo, journalRepo);

    const result = await handler.execute({
      tenantId: 'tenant-1',
      invoiceId: 'inv-to-pay',
      amountMinor: 10000n,
      currency: 'USD',
      paymentDate: new Date('2026-11-23'),
      cashAccountId: 'acc-bank-usd',
      receivableAccountId: 'acc-cxc',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingBalanceMinor).toBe(0n);

      const paidInvoice = await invoiceRepo.findById('tenant-1', 'inv-to-pay');
      expect(paidInvoice?.status).toBe('PAID');

      expect(journalRepo.entries).toHaveLength(1);
      const journalEntry = journalRepo.entries[0];
      expect(journalEntry?.totalDebit).toBe(10000n);
      expect(journalEntry?.totalCredit).toBe(10000n);
    }
  });
});
