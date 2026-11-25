import { describe, expect, it } from 'vitest';
import { IssueInvoiceCommandHandler } from '../src/application/commands/issue-invoice.command';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';

describe('Cash Invoice Issuance', () => {
  it('issues a cash invoice settling immediately as PAID and directly debiting Cash/Bank', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new IssueInvoiceCommandHandler(invoiceRepo, journalRepo);

    const result = await handler.execute({
      id: 'inv-cash-01',
      tenantId: 'tenant-01',
      customerId: 'cust-cash-01',
      documentType: 'STANDARD',
      documentNumber: 'FACT-CASH-001',
      issueDate: new Date('2026-11-24'),
      dueDate: new Date('2026-11-24'),
      currency: 'USD',
      paymentCondition: 'CASH',
      cashAccountId: 'acc-cash-usd-01',
      receivableAccountId: 'acc-ar-usd-02',
      revenueAccountId: 'acc-rev-401',
      taxPayableAccountId: 'acc-tax-201',
      lines: [
        {
          id: 'l-1',
          description: 'Venta mostrador al contado',
          quantity: 2,
          unitPriceMinor: 5000n,
          taxPercentage: 16,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const invoice = await invoiceRepo.findById('tenant-01', 'inv-cash-01');
      expect(invoice?.status).toBe('PAID');
      expect(invoice?.paymentCondition).toBe('CASH');
      expect(invoice?.remainingBalance.minorUnits).toBe(0n);
      expect(invoice?.paidAmount.minorUnits).toBe(11600n);

      const entries = await journalRepo.listByDateRange(
        'tenant-01',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );
      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry?.description).toContain('Cash sale');
      expect(entry?.lines[0]?.accountId).toBe('acc-cash-usd-01');
      expect(entry?.totalDebit).toBe(11600n);
      expect(entry?.totalCredit).toBe(11600n);
    }
  });
});
