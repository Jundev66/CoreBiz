import { describe, expect, it } from 'vitest';
import { ApplyInvoicePaymentCommandHandler } from '../src/application/commands/apply-invoice-payment.command';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('ApplyInvoicePaymentCommandHandler', () => {
  it('applies payment, updates status to PAID, and posts balanced collection journal entry', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new ApplyInvoicePaymentCommandHandler(invoiceRepo, journalRepo);

    const invoice = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-test-01', 'inv-to-pay');
    await invoiceRepo.save(invoice);

    const result = await handler.execute({
      tenantId: 'tenant-test-01',
      invoiceId: 'inv-to-pay',
      amountMinor: 10000n,
      currency: 'USD',
      paymentDate: new Date('2026-11-23'),
      cashAccountId: 'acc-cash-usd',
      receivableAccountId: 'acc-ar-usd',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingBalanceMinor).toBe(0n);

      const paidInvoice = await invoiceRepo.findById('tenant-test-01', 'inv-to-pay');
      expect(paidInvoice?.status).toBe('PAID');
      expect(paidInvoice?.paidAmount.minorUnits).toBe(10000n);

      const entries = await journalRepo.listByDateRange(
        'tenant-test-01',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );
      expect(entries).toHaveLength(1);
      const collectionEntry = entries[0];
      expect(collectionEntry?.totalDebit).toBe(10000n);
      expect(collectionEntry?.totalCredit).toBe(10000n);
    }
  });

  it('rejects payment for nonexistent invoice', async () => {
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new ApplyInvoicePaymentCommandHandler(invoiceRepo, journalRepo);

    const result = await handler.execute({
      tenantId: 'tenant-test-01',
      invoiceId: 'nonexistent',
      amountMinor: 5000n,
      currency: 'USD',
      paymentDate: new Date('2026-11-23'),
      cashAccountId: 'acc-cash-usd',
      receivableAccountId: 'acc-ar-usd',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvoiceNotFound');
    }
  });
});
