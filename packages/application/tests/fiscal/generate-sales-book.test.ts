import { describe, expect, it } from 'vitest';
import { GenerateSalesBookQueryHandler } from '../../src/fiscal/queries/generate-sales-book.query';
import { InMemoryInvoiceRepository } from '../../src/adapters/memory/invoicing';
import { Invoice, InvoiceLine } from '@corebiz/invoicing';
import { Money, Quantity } from '@corebiz/shared-kernel';
import { TaxRate } from '@corebiz/fiscal';

describe('GenerateSalesBookQueryHandler', () => {
  it('generates a compliant Venezuelan sales book from tenant invoices', async () => {
    const repo = new InMemoryInvoiceRepository();
    const qty1 = Quantity.of(1);
    const qty2 = Quantity.of(1);
    const tax16 = TaxRate.fromPercentage(16);
    const tax0 = TaxRate.zero();

    expect(qty1.ok && qty2.ok && tax16.ok).toBe(true);

    if (qty1.ok && qty2.ok && tax16.ok) {
      const line1Res = InvoiceLine.create(
        'l-1',
        'Articulo General',
        qty1.value,
        Money.fromMinor(10000n, 'VES'),
        tax16.value,
      );
      const line2Res = InvoiceLine.create(
        'l-2',
        'Articulo Exento',
        qty2.value,
        Money.fromMinor(5000n, 'VES'),
        tax0,
      );

      expect(line1Res.ok && line2Res.ok).toBe(true);

      if (line1Res.ok && line2Res.ok) {
        const invRes = Invoice.create({
          id: 'inv-ve-1',
          tenantId: 'tenant-ve-1',
          customerId: 'J-12345678-9',
          documentType: 'STANDARD',
          documentNumber: 'FACT-000100',
          controlNumber: '00-00000100',
          issueDate: new Date('2026-11-15T12:00:00Z'),
          dueDate: new Date('2026-11-30T12:00:00Z'),
          lines: [line1Res.value, line2Res.value],
        });

        expect(invRes.ok).toBe(true);
        if (invRes.ok) {
          await repo.save(invRes.value);
        }
      }
    }

    const handler = new GenerateSalesBookQueryHandler(repo);
    const result = await handler.execute({ tenantId: 'tenant-ve-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const summary = result.value;
      expect(summary.records).toHaveLength(1);
      expect(summary.records[0]?.documentNumber).toBe('FACT-000100');
      expect(summary.records[0]?.controlNumber).toBe('00-00000100');
      expect(summary.records[0]?.taxableBaseGeneralMinor).toBe(10000n);
      expect(summary.records[0]?.taxGeneralMinor).toBe(1600n);
      expect(summary.records[0]?.exemptSalesMinor).toBe(5000n);
      expect(summary.totalSalesMinor).toBe(16600n);
    }
  });
});
