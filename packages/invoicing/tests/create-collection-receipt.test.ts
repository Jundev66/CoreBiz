import { describe, expect, it } from 'vitest';
import { CreateCollectionReceiptCommandHandler } from '../src/application/commands/create-collection-receipt.command';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryPaymentReceiptRepository } from '../src/infrastructure/memory/in-memory-payment-receipt-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('CreateCollectionReceiptCommandHandler', () => {
  it('records partial and full collection against multiple invoices with balanced double-entry ledger entry', async () => {
    const receiptRepo = new InMemoryPaymentReceiptRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new CreateCollectionReceiptCommandHandler(
      receiptRepo,
      invoiceRepo,
      journalRepo,
    );

    const inv1 = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-01', 'inv-1');
    const inv2 = InvoiceMother.standard(20000n, 0, 'USD', 'tenant-01', 'inv-2');
    await invoiceRepo.save(inv1);
    await invoiceRepo.save(inv2);

    const result = await handler.execute({
      id: 'rc-cmd-01',
      tenantId: 'tenant-01',
      customerId: 'cust-test-01',
      amountMinor: 25000n,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: 'acc-bank-101',
      receivableAccountId: 'acc-ar-102',
      receiptDate: new Date('2026-11-24'),
      reference: 'WIRE-998877',
      allocations: [
        { invoiceId: 'inv-1', amountMinor: 10000n },
        { invoiceId: 'inv-2', amountMinor: 15000n },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.receiptNumber).toBe('RC-000001');

      const updatedInv1 = await invoiceRepo.findById('tenant-01', 'inv-1');
      expect(updatedInv1?.status).toBe('PAID');
      expect(updatedInv1?.remainingBalance.minorUnits).toBe(0n);

      const updatedInv2 = await invoiceRepo.findById('tenant-01', 'inv-2');
      expect(updatedInv2?.status).toBe('PARTIALLY_PAID');
      expect(updatedInv2?.remainingBalance.minorUnits).toBe(5000n);

      const savedReceipt = await receiptRepo.findById('tenant-01', 'rc-cmd-01');
      expect(savedReceipt?.status).toBe('ACTIVE');
      expect(savedReceipt?.paymentMethod).toBe('BANK_TRANSFER');
      expect(savedReceipt?.allocations).toHaveLength(2);

      const entries = await journalRepo.listByDateRange(
        'tenant-01',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );
      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry?.totalDebit).toBe(25000n);
      expect(entry?.totalCredit).toBe(25000n);
    }
  });

  it('rejects collection when allocation exceeds invoice remaining balance', async () => {
    const receiptRepo = new InMemoryPaymentReceiptRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    const handler = new CreateCollectionReceiptCommandHandler(
      receiptRepo,
      invoiceRepo,
      journalRepo,
    );

    const inv = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-01', 'inv-excess');
    await invoiceRepo.save(inv);

    const result = await handler.execute({
      id: 'rc-cmd-excess',
      tenantId: 'tenant-01',
      customerId: 'cust-test-01',
      amountMinor: 15000n,
      currency: 'USD',
      paymentMethod: 'CASH_USD',
      bankAccountId: 'acc-cash-101',
      receivableAccountId: 'acc-ar-102',
      receiptDate: new Date('2026-11-24'),
      allocations: [{ invoiceId: 'inv-excess', amountMinor: 15000n }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AllocationExceedsBalance');
    }
  });
});
