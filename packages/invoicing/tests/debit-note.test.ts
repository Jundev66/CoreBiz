import { describe, expect, it } from 'vitest';
import { IssueDebitNoteCommandHandler } from '../src/application/commands/issue-debit-note.command';
import { ListDebitNotesQueryHandler } from '../src/application/queries/list-debit-notes.query';
import { InMemoryDebitNoteRepository } from '../src/infrastructure/memory/in-memory-debit-note-repository';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting/infrastructure';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('Fiscal Debit Notes Engine & Surcharge Ledger Invariants', () => {
  it('issues a debit note for interest and surcharge with balanced double-entry ledger entry', async () => {
    const debitNoteRepo = new InMemoryDebitNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const journalRepo = new InMemoryJournalEntryRepository();

    const handler = new IssueDebitNoteCommandHandler(debitNoteRepo, invoiceRepo, journalRepo);

    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-alpha', 'inv-01');
    await invoiceRepo.save(invoice);

    const result = await handler.execute({
      id: 'dn-1',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-01',
      debitNoteNumber: 'ND-000001',
      reason: 'INTEREST',
      reasonDetails: 'Late payment interest charge 30 days overdue',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-dn-1',
          description: 'Late payment financial interest',
          quantity: 1,
          unitPriceMinor: 1000n,
          taxPercentage: 16,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.debitNoteNumber).toBe('ND-000001');
    expect(result.value.totalMinor).toBe('1160');

    const stored = await debitNoteRepo.findById('tenant-alpha', 'dn-1');
    expect(stored).not.toBeNull();
    expect(stored?.affectedInvoiceId).toBe('inv-01');
    expect(stored?.reason).toBe('INTEREST');

    const entries = await journalRepo.listByDateRange(
      'tenant-alpha',
      new Date('2026-11-01'),
      new Date('2026-11-30'),
    );
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry).not.toBeUndefined();
    expect(entry?.totalDebit).toBe(entry?.totalCredit);
    expect(entry?.totalDebit).toBe(1160n);
  });

  it('rejects debit note against a void invoice', async () => {
    const debitNoteRepo = new InMemoryDebitNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();

    const handler = new IssueDebitNoteCommandHandler(debitNoteRepo, invoiceRepo);

    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-alpha', 'inv-void');
    const voidRes = invoice.void();
    expect(voidRes.ok).toBe(true);
    if (!voidRes.ok) return;

    await invoiceRepo.save(voidRes.value);

    const result = await handler.execute({
      id: 'dn-2',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-void',
      debitNoteNumber: 'ND-000002',
      reason: 'ADDITIONAL_CHARGE',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-dn-2',
          description: 'Extra freight surcharge',
          quantity: 1,
          unitPriceMinor: 500n,
          taxPercentage: 16,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('CannotDebitVoidInvoice');
  });

  it('lists debit notes with strict multi-tenant boundary and filters', async () => {
    const debitNoteRepo = new InMemoryDebitNoteRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();

    const handler = new IssueDebitNoteCommandHandler(debitNoteRepo, invoiceRepo);
    const queryHandler = new ListDebitNotesQueryHandler(debitNoteRepo);

    const invA = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-alpha', 'inv-a');
    const invB = InvoiceMother.standard(10000n, 0, 'USD', 'tenant-beta', 'inv-b');
    await invoiceRepo.save(invA);
    await invoiceRepo.save(invB);

    await handler.execute({
      id: 'dn-a',
      tenantId: 'tenant-alpha',
      affectedInvoiceId: 'inv-a',
      debitNoteNumber: 'ND-000001',
      reason: 'PRICE_CORRECTION',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-1',
          description: 'Price undercharge adjustment',
          quantity: 1,
          unitPriceMinor: 800n,
          taxPercentage: 0,
        },
      ],
    });

    await handler.execute({
      id: 'dn-b',
      tenantId: 'tenant-beta',
      affectedInvoiceId: 'inv-b',
      debitNoteNumber: 'ND-000001',
      reason: 'PRICE_CORRECTION',
      issueDate: new Date('2026-11-24'),
      lines: [
        {
          id: 'l-2',
          description: 'Price undercharge adjustment',
          quantity: 1,
          unitPriceMinor: 900n,
          taxPercentage: 0,
        },
      ],
    });

    const alphaNotes = await queryHandler.execute({ tenantId: 'tenant-alpha' });
    const betaNotes = await queryHandler.execute({ tenantId: 'tenant-beta' });

    expect(alphaNotes.length).toBe(1);
    expect(alphaNotes[0]?.id).toBe('dn-a');

    expect(betaNotes.length).toBe(1);
    expect(betaNotes[0]?.id).toBe('dn-b');
  });
});
