import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/shared-kernel';
import { computeDaysOverdue, determineAgingBucket } from '../src/domain/port/aging-ports';
import {
  InMemoryReceivableInvoicesAdapter,
  InMemoryPayableBillsAdapter,
} from '../src/infrastructure/memory/in-memory-aging-adapters';
import { GetArAgingReportQueryHandler } from '../src/application/queries/get-ar-aging-report.query';
import { GetApAgingReportQueryHandler } from '../src/application/queries/get-ap-aging-report.query';

describe('Accounts Receivable & Accounts Payable Aging Analysis (TICKET-023)', () => {
  const tenantId = 'tenant-corp-01';

  it('categorizes open customer invoices into exact aging buckets as of specified date', async () => {
    const adapter = new InMemoryReceivableInvoicesAdapter();
    const handler = new GetArAgingReportQueryHandler(adapter);

    const asOfDate = new Date('2026-11-24T00:00:00Z');

    adapter.setInvoices([
      {
        id: 'inv-1',
        tenantId,
        customerId: 'cust-wholesaler-01',
        customerName: 'Cliente Mayorista 01',
        taxId: 'J-12345678-0',
        documentNumber: 'INV-2026-001',
        issueDate: new Date('2026-11-01T00:00:00Z'),
        dueDate: new Date('2026-11-30T00:00:00Z'),
        total: Money.fromMinor(10000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(10000n, 'USD'),
        status: 'ISSUED',
      },
      {
        id: 'inv-2',
        tenantId,
        customerId: 'cust-wholesaler-01',
        customerName: 'Cliente Mayorista 01',
        taxId: 'J-12345678-0',
        documentNumber: 'INV-2026-002',
        issueDate: new Date('2026-10-10T00:00:00Z'),
        dueDate: new Date('2026-11-10T00:00:00Z'),
        total: Money.fromMinor(20000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(20000n, 'USD'),
        status: 'ISSUED',
      },
      {
        id: 'inv-3',
        tenantId,
        customerId: 'cust-wholesaler-01',
        customerName: 'Cliente Mayorista 01',
        taxId: 'J-12345678-0',
        documentNumber: 'INV-2026-003',
        issueDate: new Date('2026-08-01T00:00:00Z'),
        dueDate: new Date('2026-09-01T00:00:00Z'),
        total: Money.fromMinor(30000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(30000n, 'USD'),
        status: 'ISSUED',
      },
    ]);

    const report = await handler.execute({
      tenantId,
      asOfDate,
      customerId: 'cust-wholesaler-01',
    });

    expect(report.direction).toBe('RECEIVABLE');
    expect(report.totalOpenMinor).toBe('60000');
    expect(report.totalCurrentMinor).toBe('10000');
    expect(report.totalDays1To30Minor).toBe('20000');
    expect(report.totalDays31To60Minor).toBe('0');
    expect(report.totalDays61To90Minor).toBe('30000');
    expect(report.totalDays90PlusMinor).toBe('0');

    expect(report.partners.length).toBe(1);
    const partner = report.partners[0]!;
    expect(partner.entityId).toBe('cust-wholesaler-01');
    expect(partner.entityName).toBe('Cliente Mayorista 01');
    expect(partner.taxId).toBe('J-12345678-0');
    expect(partner.totalOpenMinor).toBe('60000');
    expect(partner.currentMinor).toBe('10000');
    expect(partner.days1To30Minor).toBe('20000');
    expect(partner.days31To60Minor).toBe('0');
    expect(partner.days61To90Minor).toBe('30000');
    expect(partner.days90PlusMinor).toBe('0');

    expect(partner.documents.length).toBe(3);
    expect(partner.documents[0]?.bucket).toBe('CURRENT');
    expect(partner.documents[1]?.bucket).toBe('DAYS_1_30');
    expect(partner.documents[2]?.bucket).toBe('DAYS_61_90');
  });

  it('strictly preserves the Bucket Conservation Invariant', async () => {
    const adapter = new InMemoryReceivableInvoicesAdapter();
    const handler = new GetArAgingReportQueryHandler(adapter);

    const asOfDate = new Date('2026-11-24T00:00:00Z');

    adapter.setInvoices([
      {
        id: 'inv-c1-1',
        tenantId,
        customerId: 'cust-1',
        documentNumber: 'INV-101',
        issueDate: new Date('2026-10-01T00:00:00Z'),
        dueDate: new Date('2026-10-15T00:00:00Z'),
        total: Money.fromMinor(15500n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(15500n, 'USD'),
        status: 'ISSUED',
      },
      {
        id: 'inv-c1-2',
        tenantId,
        customerId: 'cust-1',
        documentNumber: 'INV-102',
        issueDate: new Date('2026-06-01T00:00:00Z'),
        dueDate: new Date('2026-07-01T00:00:00Z'),
        total: Money.fromMinor(24500n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(24500n, 'USD'),
        status: 'ISSUED',
      },
      {
        id: 'inv-c2-1',
        tenantId,
        customerId: 'cust-2',
        documentNumber: 'INV-201',
        issueDate: new Date('2026-11-20T00:00:00Z'),
        dueDate: new Date('2026-12-05T00:00:00Z'),
        total: Money.fromMinor(50000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(50000n, 'USD'),
        status: 'ISSUED',
      },
    ]);

    const report = await handler.execute({ tenantId, asOfDate });

    for (const p of report.partners) {
      const sumBuckets =
        BigInt(p.currentMinor) +
        BigInt(p.days1To30Minor) +
        BigInt(p.days31To60Minor) +
        BigInt(p.days61To90Minor) +
        BigInt(p.days90PlusMinor);
      expect(sumBuckets).toBe(BigInt(p.totalOpenMinor));
    }

    const grandSumBuckets =
      BigInt(report.totalCurrentMinor) +
      BigInt(report.totalDays1To30Minor) +
      BigInt(report.totalDays31To60Minor) +
      BigInt(report.totalDays61To90Minor) +
      BigInt(report.totalDays90PlusMinor);
    expect(grandSumBuckets).toBe(BigInt(report.totalOpenMinor));
  });

  it('ignores fully paid and voided invoices in aging projections', async () => {
    const adapter = new InMemoryReceivableInvoicesAdapter();
    const handler = new GetArAgingReportQueryHandler(adapter);

    const asOfDate = new Date('2026-11-24T00:00:00Z');

    adapter.setInvoices([
      {
        id: 'inv-paid',
        tenantId,
        customerId: 'cust-1',
        documentNumber: 'INV-PAID',
        issueDate: new Date('2026-10-01T00:00:00Z'),
        dueDate: new Date('2026-10-15T00:00:00Z'),
        total: Money.fromMinor(10000n, 'USD'),
        paidAmount: Money.fromMinor(10000n, 'USD'),
        remainingBalance: Money.zero('USD'),
        status: 'PAID',
      },
      {
        id: 'inv-void',
        tenantId,
        customerId: 'cust-1',
        documentNumber: 'INV-VOID',
        issueDate: new Date('2026-10-01T00:00:00Z'),
        dueDate: new Date('2026-10-15T00:00:00Z'),
        total: Money.fromMinor(20000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(20000n, 'USD'),
        status: 'VOID',
      },
      {
        id: 'inv-active',
        tenantId,
        customerId: 'cust-1',
        documentNumber: 'INV-ACTIVE',
        issueDate: new Date('2026-10-01T00:00:00Z'),
        dueDate: new Date('2026-10-15T00:00:00Z'),
        total: Money.fromMinor(5000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(5000n, 'USD'),
        status: 'ISSUED',
      },
    ]);

    const report = await handler.execute({ tenantId, asOfDate });
    expect(report.totalOpenMinor).toBe('5000');
    expect(report.partners.length).toBe(1);
    expect(report.partners[0]?.documents.length).toBe(1);
    expect(report.partners[0]?.documents[0]?.documentNumber).toBe('INV-ACTIVE');
  });

  it('computes Accounts Payable (AP Aging) across suppliers and buckets', async () => {
    const apAdapter = new InMemoryPayableBillsAdapter();
    const apHandler = new GetApAgingReportQueryHandler(apAdapter);

    const asOfDate = new Date('2026-11-24T00:00:00Z');

    apAdapter.setBills([
      {
        id: 'bill-1',
        tenantId,
        supplierId: 'supp-tech',
        supplierName: 'Distribuidora Tech C.A.',
        taxId: 'J-99887766-5',
        billNumber: 'FACT-PROV-001',
        issueDate: new Date('2026-11-10T00:00:00Z'),
        dueDate: new Date('2026-11-25T00:00:00Z'),
        total: Money.fromMinor(40000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(40000n, 'USD'),
        status: 'OPEN',
      },
      {
        id: 'bill-2',
        tenantId,
        supplierId: 'supp-tech',
        supplierName: 'Distribuidora Tech C.A.',
        taxId: 'J-99887766-5',
        billNumber: 'FACT-PROV-002',
        issueDate: new Date('2026-07-01T00:00:00Z'),
        dueDate: new Date('2026-08-01T00:00:00Z'),
        total: Money.fromMinor(80000n, 'USD'),
        paidAmount: Money.zero('USD'),
        remainingBalance: Money.fromMinor(80000n, 'USD'),
        status: 'OPEN',
      },
    ]);

    const apReport = await apHandler.execute({ tenantId, asOfDate });
    expect(apReport.direction).toBe('PAYABLE');
    expect(apReport.totalOpenMinor).toBe('120000');
    expect(apReport.totalCurrentMinor).toBe('40000');
    expect(apReport.totalDays90PlusMinor).toBe('80000');

    expect(apReport.partners.length).toBe(1);
    expect(apReport.partners[0]?.entityName).toBe('Distribuidora Tech C.A.');
  });

  it('asserts exact day boundary classifications', () => {
    const asOf = new Date('2026-11-24T00:00:00Z');

    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-11-24T00:00:00Z')))).toBe(
      'CURRENT',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-11-25T00:00:00Z')))).toBe(
      'CURRENT',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-10-25T00:00:00Z')))).toBe(
      'DAYS_1_30',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-10-24T00:00:00Z')))).toBe(
      'DAYS_31_60',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-09-25T00:00:00Z')))).toBe(
      'DAYS_31_60',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-09-24T00:00:00Z')))).toBe(
      'DAYS_61_90',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-08-26T00:00:00Z')))).toBe(
      'DAYS_61_90',
    );
    expect(determineAgingBucket(computeDaysOverdue(asOf, new Date('2026-08-25T00:00:00Z')))).toBe(
      'DAYS_90_PLUS',
    );
  });
});
