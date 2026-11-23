import { describe, expect, it } from 'vitest';
import { InMemoryInvoiceRepository } from '../src/infrastructure/memory/in-memory-invoice-repository';
import { InvoiceMother } from './mothers/InvoiceMother';

describe('InMemoryInvoiceRepository', () => {
  it('saves and finds invoice by id within tenant', async () => {
    const repo = new InMemoryInvoiceRepository();
    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-repo-01', 'inv-01');

    await repo.save(invoice);

    const found = await repo.findById('tenant-repo-01', 'inv-01');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('inv-01');

    const foreignTenant = await repo.findById('other-tenant', 'inv-01');
    expect(foreignTenant).toBeNull();
  });

  it('finds invoice by document number within tenant', async () => {
    const repo = new InMemoryInvoiceRepository();
    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-repo-01', 'inv-02');

    await repo.save(invoice);

    const found = await repo.findByNumber('tenant-repo-01', 'STANDARD', 'FACT-TEST-001');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('inv-02');
  });

  it('lists invoices by customer ordered by issue date descending', async () => {
    const repo = new InMemoryInvoiceRepository();
    const invoice = InvoiceMother.standard(10000n, 16, 'USD', 'tenant-repo-01', 'inv-03');

    await repo.save(invoice);

    const customerInvoices = await repo.listByCustomer('tenant-repo-01', 'cust-test-01');
    expect(customerInvoices).toHaveLength(1);
    expect(customerInvoices[0]?.id).toBe('inv-03');
  });
});
