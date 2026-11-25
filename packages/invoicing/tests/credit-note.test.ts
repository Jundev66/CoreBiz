import { describe, expect, it } from 'vitest';
import { IssueCreditNoteCommandHandler } from '../src/application/commands/issue-credit-note.command';
import { ListCreditNotesQueryHandler } from '../src/application/queries/list-credit-notes.query';
import { InMemoryCreditNoteRepository } from '../src/infrastructure/memory/in-memory-credit-note-repository';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('Fiscal Credit Notes Engine & Double-Entry Invariants', () => {
  it('issues a credit note for full return of goods and zeroes invoice remaining balance', async () => {
    const creditNoteRepo = new InMemoryCreditNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();

    const handler = new IssueCreditNoteCommandHandler(creditNoteRepo, invoiceRepo, journalRepo);

    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-alpha', 'inv-01');
    await invoiceRepo.save(invoice);

    const totalBefore = invoice.total.minorUnits;
    expect(totalBefore).toBe(11600n);

    const result = await handler.execute({
      id: 'cn-1',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-01',
      creditNoteNumber: 'NC-000001',
      reason: 'RETURN',
      reasonDetails: 'Defective merchandise return',
      issueDate: new Date('2026-11-24'),
      restockItems: true,
      lines: [
        {
          id: 'l-cn-1',
          description: 'Defective Item 1',
          quantity: 1,
          unitPriceMinor: 10000n,
          taxPercentage: 16,
          productId: 'prod-01',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.creditNoteNumber).toBe('NC-000001');
    expect(result.value.totalMinor).toBe('11600');

    const updatedInvoice = await invoiceRepo.findById('tenant-alpha', 'inv-01');
    expect(updatedInvoice).not.toBeNull();
    expect(updatedInvoice?.creditedAmount.minorUnits).toBe(11600n);
    expect(updatedInvoice?.remainingBalance.minorUnits).toBe(0n);
    expect(updatedInvoice?.status).toBe('PAID');

    const entries = await journalRepo.listByDateRange(
      'tenant-alpha',
      new Date('2026-11-01'),
      new Date('2026-11-30'),
    );
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry).not.toBeUndefined();
    expect(entry?.totalDebit).toBe(entry?.totalCredit);
    expect(entry?.totalDebit).toBe(11600n);
  });

  it('issues a partial credit note reducing invoice remaining balance proportionally', async () => {
    const creditNoteRepo = new InMemoryCreditNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();

    const handler = new IssueCreditNoteCommandHandler(creditNoteRepo, invoiceRepo, journalRepo);

    const invoice = InvoiceMother.withMultipleLines('tenant-alpha', 'inv-02', 'USD');
    await invoiceRepo.save(invoice);

    const result = await handler.execute({
      id: 'cn-2',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-02',
      creditNoteNumber: 'NC-000002',
      reason: 'DISCOUNT',
      reasonDetails: 'Post-sale commercial discount on item 2',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-cn-2',
          description: 'Discount allowance on item 2',
          quantity: 1,
          unitPriceMinor: 2000n,
          taxPercentage: 0,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updatedInvoice = await invoiceRepo.findById('tenant-alpha', 'inv-02');
    expect(updatedInvoice?.creditedAmount.minorUnits).toBe(2000n);
    expect(updatedInvoice?.status).toBe('PARTIALLY_PAID');
    expect(updatedInvoice?.remainingBalance.minorUnits).toBe(invoice.total.minorUnits - 2000n);
  });

  it('rejects credit note that exceeds remaining balance of invoice', async () => {
    const creditNoteRepo = new InMemoryCreditNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();

    const handler = new IssueCreditNoteCommandHandler(creditNoteRepo, invoiceRepo);

    const invoice = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-alpha', 'inv-03');
    await invoiceRepo.save(invoice);

    const result = await handler.execute({
      id: 'cn-3',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-03',
      creditNoteNumber: 'NC-000003',
      reason: 'RETURN',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-cn-3',
          description: 'Over-credited line',
          quantity: 1,
          unitPriceMinor: 15000n,
          taxPercentage: 0,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('CreditExceedsRemainingBalance');
  });

  it('rejects credit note against a void invoice', async () => {
    const creditNoteRepo = new InMemoryCreditNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();

    const handler = new IssueCreditNoteCommandHandler(creditNoteRepo, invoiceRepo);

    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-alpha', 'inv-void');
    const voidRes = invoice.void();
    expect(voidRes.ok).toBe(true);
    if (!voidRes.ok) return;

    await invoiceRepo.save(voidRes.value);

    const result = await handler.execute({
      id: 'cn-4',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-void',
      creditNoteNumber: 'NC-000004',
      reason: 'CANCELLATION',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-cn-4',
          description: 'Line',
          quantity: 1,
          unitPriceMinor: 5000n,
          taxPercentage: 16,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('CannotCreditVoidInvoice');
  });

  it('lists credit notes with strict multi-tenant boundary and filters', async () => {
    const creditNoteRepo = new InMemoryCreditNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();

    const handler = new IssueCreditNoteCommandHandler(creditNoteRepo, invoiceRepo);
    const queryHandler = new ListCreditNotesQueryHandler(creditNoteRepo);

    const invA = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-alpha', 'inv-a');
    const invB = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-beta', 'inv-b');
    await invoiceRepo.save(invA);
    await invoiceRepo.save(invB);

    await handler.execute({
      id: 'cn-a',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-a',
      creditNoteNumber: 'NC-000001',
      reason: 'DISCOUNT',
      issueDate: new Date('2026-11-24'),
      lines: [
        { id: 'l-1', description: 'Item A', quantity: 1, unitPriceMinor: 1000n, taxPercentage: 0 },
      ],
    });

    await handler.execute({
      id: 'cn-b',
      tenantId: 'tenant-beta',
      affectedInvoiceId: 'inv-b',
      creditNoteNumber: 'NC-000001',
      reason: 'DISCOUNT',
      issueDate: new Date('2026-11-24'),
      lines: [
        { id: 'l-2', description: 'Item B', quantity: 1, unitPriceMinor: 2000n, taxPercentage: 0 },
      ],
    });

    const alphaNotes = await queryHandler.execute({ tenantId: 'tenant-alpha' });
    const betaNotes = await queryHandler.execute({ tenantId: 'tenant-beta' });

    expect(alphaNotes.length).toBe(1);
    expect(alphaNotes[0]?.id).toBe('cn-a');

    expect(betaNotes.length).toBe(1);
    expect(betaNotes[0]?.id).toBe('cn-b');
  });
});
