import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/shared-kernel';
import { InvoiceMother } from './mothers/InvoiceMother';
import { InvoiceLineMother } from './mothers/InvoiceLineMother';
import { Invoice } from '../src/domain/model/invoice';

describe('Invoice Aggregate & Invariants', () => {
  it('calculates totals correctly with single standard taxed line', () => {
    const invoice = InvoiceMother.standard(20000n, 16, 'USD');
    expect(invoice.subtotal.minorUnits).toBe(20000n);
    expect(invoice.taxTotal.minorUnits).toBe(3200n);
    expect(invoice.total.minorUnits).toBe(23200n);
    expect(invoice.paidAmount.minorUnits).toBe(0n);
    expect(invoice.remainingBalance.minorUnits).toBe(23200n);
    expect(invoice.status).toBe('ISSUED');
  });

  it('aggregates multiple lines with mixed tax rates', () => {
    const invoice = InvoiceMother.withMultipleLines();
    expect(invoice.subtotal.minorUnits).toBe(15000n);
    expect(invoice.taxTotal.minorUnits).toBe(1600n);
    expect(invoice.total.minorUnits).toBe(16600n);
    expect(invoice.remainingBalance.minorUnits).toBe(16600n);
  });

  it('rejects invoice creation with empty lines', () => {
    const result = Invoice.create({
      id: 'inv-empty',
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      documentType: 'STANDARD',
      documentNumber: 'FACT-EMPTY',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      lines: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('EmptyInvoiceLines');
    }
  });

  it('rejects invoice creation with mixed line currencies', () => {
    const lineUsd = InvoiceLineMother.standard(10000n, 16, 'USD', 'l-usd');
    const lineVes = InvoiceLineMother.standard(10000n, 16, 'VES', 'l-ves');

    const result = Invoice.create({
      id: 'inv-mixed',
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      documentType: 'STANDARD',
      documentNumber: 'FACT-MIXED',
      issueDate: new Date('2026-11-23'),
      dueDate: new Date('2026-12-23'),
      lines: [lineUsd, lineVes],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvoiceCurrencyMismatch');
    }
  });

  it('transitions state to PARTIALLY_PAID on partial settlement', () => {
    const invoice = InvoiceMother.standard(10000n, 0, 'USD');
    const partialPayment = Money.fromMinor(4000n, 'USD');

    const paidResult = invoice.applyPayment(partialPayment);
    expect(paidResult.ok).toBe(true);
    if (paidResult.ok) {
      expect(paidResult.value.status).toBe('PARTIALLY_PAID');
      expect(paidResult.value.paidAmount.minorUnits).toBe(4000n);
      expect(paidResult.value.remainingBalance.minorUnits).toBe(6000n);
    }
  });

  it('transitions state to PAID when balance is completely settled', () => {
    const invoice = InvoiceMother.standard(5000n, 0, 'USD');
    const fullPayment = Money.fromMinor(5000n, 'USD');

    const fullyPaid = invoice.applyPayment(fullPayment);
    expect(fullyPaid.ok).toBe(true);
    if (fullyPaid.ok) {
      expect(fullyPaid.value.status).toBe('PAID');
      expect(fullyPaid.value.remainingBalance.isZero).toBe(true);
      expect(fullyPaid.value.paidAmount.minorUnits).toBe(5000n);
    }
  });

  it('rejects payment exceeding remaining balance', () => {
    const invoice = InvoiceMother.standard(5000n, 0, 'USD');
    const excessivePayment = Money.fromMinor(6000n, 'USD');

    const result = invoice.applyPayment(excessivePayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('PaymentExceedsRemainingBalance');
      expect(result.error.remainingBalance).toBe(5000n);
      expect(result.error.attemptedPayment).toBe(6000n);
    }
  });

  it('rejects payment in a mismatched currency', () => {
    const invoice = InvoiceMother.standard(10000n, 0, 'USD');
    const vesPayment = Money.fromMinor(10000n, 'VES');

    const result = invoice.applyPayment(vesPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvoiceCurrencyMismatch');
    }
  });

  it('prevents voiding an invoice with existing payments', () => {
    const invoice = InvoiceMother.standard(10000n, 0, 'USD');
    const partial = invoice.applyPayment(Money.fromMinor(2000n, 'USD'));
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      const voidResult = partial.value.void();
      expect(voidResult.ok).toBe(false);
      if (!voidResult.ok) {
        expect(voidResult.error.kind).toBe('CannotVoidPaidInvoice');
      }
    }
  });

  it('successfully voids an unpaid issued invoice', () => {
    const invoice = InvoiceMother.standard(10000n, 0, 'USD');
    const voidResult = invoice.void();
    expect(voidResult.ok).toBe(true);
    if (voidResult.ok) {
      expect(voidResult.value.status).toBe('VOID');
      expect(voidResult.value.remainingBalance.isZero).toBe(true);
    }
  });
});
