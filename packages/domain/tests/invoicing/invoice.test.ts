import { describe, expect, it } from 'vitest';
import { MoneyMother } from '../shared/MoneyMother';
import { InvoiceMother } from './InvoiceMother';

describe('Invoice Aggregate & Lifecycle', () => {
  it('creates and calculates invoice with standard 16% VAT using Mother', () => {
    const invoice = InvoiceMother.standard(20000n, 16, 'USD');
    expect(invoice.subtotal.minorUnits).toBe(20000n);
    expect(invoice.taxTotal.minorUnits).toBe(3200n);
    expect(invoice.total.minorUnits).toBe(23200n);
    expect(invoice.paidAmount.minorUnits).toBe(0n);
    expect(invoice.remainingBalance.minorUnits).toBe(23200n);
    expect(invoice.status).toBe('ISSUED');
  });

  it('updates state to PARTIALLY_PAID on partial payment', () => {
    const invoice = InvoiceMother.standard(10000n, 0, 'USD');
    const payment = MoneyMother.usd('40.00');

    const paidResult = invoice.applyPayment(payment);
    expect(paidResult.ok).toBe(true);
    if (paidResult.ok) {
      expect(paidResult.value.status).toBe('PARTIALLY_PAID');
      expect(paidResult.value.paidAmount.minorUnits).toBe(4000n);
      expect(paidResult.value.remainingBalance.minorUnits).toBe(6000n);
    }
  });

  it('updates state to PAID when balance reaches zero', () => {
    const invoice = InvoiceMother.standard(5000n, 0, 'USD');
    const fullPayment = MoneyMother.usd('50.00');

    const fullyPaid = invoice.applyPayment(fullPayment);
    expect(fullyPaid.ok).toBe(true);
    if (fullyPaid.ok) {
      expect(fullyPaid.value.status).toBe('PAID');
      expect(fullyPaid.value.remainingBalance.isZero).toBe(true);
    }
  });

  it('rejects payment exceeding remaining balance', () => {
    const invoice = InvoiceMother.standard(5000n, 0, 'USD');
    const excessivePayment = MoneyMother.usd('60.00');

    const paymentResult = invoice.applyPayment(excessivePayment);
    expect(paymentResult.ok).toBe(false);
    if (!paymentResult.ok) {
      expect(paymentResult.error.kind).toBe('PaymentExceedsRemainingBalance');
    }
  });
});
