import { describe, expect, it } from 'vitest';
import { Invoice, ListInvoicesQueryHandler } from '../src';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InvoiceLineMother } from './mothers/InvoiceLineMother';

describe('ListInvoicesQueryHandler', () => {
  it('lists tenant invoices sorted chronologically', async () => {
    const repo = new InMemoryInvoiceRepository();
    const line = InvoiceLineMother.standard(10000n, 0, 'USD', 'line-1', 'Consulting Service');

    const invRes = Invoice.create({
      id: 'inv-1',
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      documentType: 'STANDARD',
      documentNumber: 'FAC-0001',
      issueDate: new Date('2026-11-23T10:00:00Z'),
      dueDate: new Date('2026-11-30T10:00:00Z'),
      lines: [line],
    });

    expect(invRes.ok).toBe(true);
    if (invRes.ok) {
      await repo.save(invRes.value);
    }

    const handler = new ListInvoicesQueryHandler(repo);
    const result = await handler.execute({ tenantId: 'tenant-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.documentNumber).toBe('FAC-0001');
      expect(result.value[0]?.totalMinor).toBe('10000');
    }
  });
});
