import { describe, expect, it } from 'vitest';
import { VenezuelaFiscalBookService } from '../src/infrastructure/reports/venezuela-fiscal-book.service';
import type { SalesSourceTransaction } from '../src/domain/model/sales-book-record';
import type { PurchasesSourceTransaction } from '../src/domain/model/purchases-book-record';

describe('VenezuelaFiscalBookService', () => {
  const service = new VenezuelaFiscalBookService();

  it('builds chronological sales book with correct column totals and SENIAT sequential numbers', () => {
    const transactions: SalesSourceTransaction[] = [
      {
        invoiceId: 'inv-2',
        issueDate: new Date('2026-11-15T10:00:00Z'),
        customerTaxId: 'J-12345678-9',
        customerName: 'Cliente Prueba 02 C.A.',
        documentNumber: 'FACT-0002',
        controlNumber: '00-00000002',
        documentType: 'FACTURA',
        totalMinor: 11600n,
        exemptMinor: 0n,
        taxableBaseGeneralMinor: 10000n,
        taxGeneralMinor: 1600n,
        taxGeneralPercentage: 16,
        taxableBaseReducedMinor: 0n,
        taxReducedMinor: 0n,
        taxReducedPercentage: 8,
        igtfMinor: 348n,
        vatWithheldMinor: 1200n,
        currency: 'VES',
      },
      {
        invoiceId: 'inv-1',
        issueDate: new Date('2026-11-05T09:00:00Z'),
        customerTaxId: 'V-11223344-5',
        customerName: 'Cliente Prueba 01',
        documentNumber: 'FACT-0001',
        controlNumber: '00-00000001',
        documentType: 'FACTURA',
        totalMinor: 5000n,
        exemptMinor: 5000n,
        taxableBaseGeneralMinor: 0n,
        taxGeneralMinor: 0n,
        taxGeneralPercentage: 16,
        taxableBaseReducedMinor: 0n,
        taxReducedMinor: 0n,
        taxReducedPercentage: 8,
        igtfMinor: 0n,
        vatWithheldMinor: 0n,
        currency: 'VES',
      },
    ];

    const summary = service.buildSalesBook(transactions);

    expect(summary.records).toHaveLength(2);
    expect(summary.records[0]?.operationNumber).toBe(1);
    expect(summary.records[0]?.documentNumber).toBe('FACT-0001');
    expect(summary.records[1]?.operationNumber).toBe(2);
    expect(summary.records[1]?.documentNumber).toBe('FACT-0002');
    expect(summary.totalSalesMinor).toBe(16600n);
    expect(summary.totalExemptMinor).toBe(5000n);
    expect(summary.totalTaxableBaseMinor).toBe(10000n);
    expect(summary.totalTaxDebitMinor).toBe(1600n);
    expect(summary.totalIgtfMinor).toBe(348n);
    expect(summary.totalWithheldMinor).toBe(1200n);
  });

  it('subtracts credit notes from purchases book totals', () => {
    const transactions: PurchasesSourceTransaction[] = [
      {
        receiptId: 'rec-1',
        receiptDate: new Date('2026-11-01T10:00:00Z'),
        supplierTaxId: 'J-99887766-5',
        supplierName: 'Proveedor Prueba 01 S.A.',
        documentNumber: 'FAC-PROV-101',
        controlNumber: '00-99990001',
        documentType: 'FACTURA',
        totalMinor: 23200n,
        exemptMinor: 0n,
        taxableBaseGeneralMinor: 20000n,
        taxGeneralMinor: 3200n,
        taxGeneralPercentage: 16,
        vatWithheldMinor: 2400n,
        currency: 'VES',
      },
      {
        receiptId: 'rec-2',
        receiptDate: new Date('2026-11-10T11:00:00Z'),
        supplierTaxId: 'J-99887766-5',
        supplierName: 'Proveedor Prueba 01 S.A.',
        documentNumber: 'NC-PROV-001',
        affectedDocumentNumber: 'FAC-PROV-101',
        documentType: 'NOTA_CREDITO',
        totalMinor: 5800n,
        exemptMinor: 0n,
        taxableBaseGeneralMinor: 5000n,
        taxGeneralMinor: 800n,
        taxGeneralPercentage: 16,
        vatWithheldMinor: 600n,
        currency: 'VES',
      },
    ];

    const summary = service.buildPurchasesBook(transactions);

    expect(summary.records).toHaveLength(2);
    expect(summary.totalPurchasesMinor).toBe(17400n);
    expect(summary.totalTaxableBaseMinor).toBe(15000n);
    expect(summary.totalTaxCreditMinor).toBe(2400n);
    expect(summary.totalWithheldMinor).toBe(1800n);
  });
});
