import { describe, expect, it } from 'vitest';
import { CreateCollectionReceiptCommandHandler } from '../src/application/commands/create-collection-receipt.command';
import { VoidCollectionReceiptCommandHandler } from '../src/application/commands/void-collection-receipt.command';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryPaymentReceiptRepository } from '../src/infrastructure/memory/in-memory-payment-receipt-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('VoidCollectionReceiptCommandHandler', () => {
  it('voids receipt, restores invoice balances, and generates reversing balanced journal entry', async () => {
    const receiptRepo = new InMemoryPaymentReceiptRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();

    const createHandler = new CreateCollectionReceiptCommandHandler(
      receiptRepo,
      invoiceRepo,
      journalRepo,
    );
    const voidHandler = new VoidCollectionReceiptCommandHandler(
      receiptRepo,
      invoiceRepo,
      journalRepo,
    );

    const inv = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-01', 'inv-to-void');
    await invoiceRepo.save(inv);

    await createHandler.execute({
      id: 'rc-void-01',
      tenantId: 'tenant-01',
      customerId: 'cust-test-01',
      amountMinor: 6000n,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: 'acc-bank-101',
      receivableAccountId: 'acc-ar-102',
      receiptDate: new Date('2026-11-24'),
      allocations: [{ invoiceId: 'inv-to-void', amountMinor: 6000n }],
    });

    const midInvoice = await invoiceRepo.findById('tenant-01', 'inv-to-void');
    expect(midInvoice?.remainingBalance.minorUnits).toBe(4000n);
    expect(midInvoice?.status).toBe('PARTIALLY_PAID');

    const voidResult = await voidHandler.execute({
      tenantId: 'tenant-01',
      receiptId: 'rc-void-01',
      reason: 'Error de digitacion de cuenta destino',
      bankAccountId: 'acc-bank-101',
      receivableAccountId: 'acc-ar-102',
      voidedAt: new Date('2026-11-25'),
    });

    expect(voidResult.ok).toBe(true);

    const restoredInvoice = await invoiceRepo.findById('tenant-01', 'inv-to-void');
    expect(restoredInvoice?.remainingBalance.minorUnits).toBe(10000n);
    expect(restoredInvoice?.status).toBe('ISSUED');

    const voidedReceipt = await receiptRepo.findById('tenant-01', 'rc-void-01');
    expect(voidedReceipt?.status).toBe('VOIDED');
    expect(voidedReceipt?.voidReason).toBe('Error de digitacion de cuenta destino');

    const entries = await journalRepo.listByDateRange(
      'tenant-01',
      new Date('2026-01-01'),
      new Date('2026-12-31'),
    );
    expect(entries).toHaveLength(2);
    const reversalEntry = entries.find((e) => e.description.includes('Reversal'));
    expect(reversalEntry).toBeDefined();
    expect(reversalEntry?.totalDebit).toBe(6000n);
    expect(reversalEntry?.totalCredit).toBe(6000n);
  });
});
