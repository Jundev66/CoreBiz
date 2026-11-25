import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/shared-kernel';
import { PaymentReceipt } from '../src/domain/model/payment-receipt';

describe('PaymentReceipt Aggregate', () => {
  it('creates active payment receipt when allocations match total amount', () => {
    const amount = Money.fromMinor(15000n, 'USD');
    const allocAmount1 = Money.fromMinor(10000n, 'USD');
    const allocAmount2 = Money.fromMinor(5000n, 'USD');

    const result = PaymentReceipt.create({
      id: 'rc-01',
      tenantId: 'tenant-01',
      receiptNumber: 'RC-000001',
      customerId: 'cust-01',
      amount,
      paymentMethod: 'BANK_TRANSFER',
      bankAccountId: 'acc-bank-01',
      receiptDate: new Date('2026-11-24'),
      reference: 'REF-12345',
      allocations: [
        {
          invoiceId: 'inv-01',
          amount: allocAmount1,
          previousBalance: Money.fromMinor(10000n, 'USD'),
          newBalance: Money.fromMinor(0n, 'USD'),
        },
        {
          invoiceId: 'inv-02',
          amount: allocAmount2,
          previousBalance: Money.fromMinor(20000n, 'USD'),
          newBalance: Money.fromMinor(15000n, 'USD'),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ACTIVE');
      expect(result.value.receiptNumber).toBe('RC-000001');
      expect(result.value.allocations).toHaveLength(2);
    }
  });

  it('rejects receipt when allocations do not sum to total amount', () => {
    const amount = Money.fromMinor(15000n, 'USD');
    const allocAmount = Money.fromMinor(10000n, 'USD');

    const result = PaymentReceipt.create({
      id: 'rc-02',
      tenantId: 'tenant-01',
      receiptNumber: 'RC-000002',
      customerId: 'cust-01',
      amount,
      paymentMethod: 'CASH_USD',
      bankAccountId: 'acc-cash-01',
      receiptDate: new Date('2026-11-24'),
      allocations: [
        {
          invoiceId: 'inv-01',
          amount: allocAmount,
          previousBalance: Money.fromMinor(10000n, 'USD'),
          newBalance: Money.fromMinor(0n, 'USD'),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AllocationSumMismatch');
    }
  });

  it('rejects allocation exceeding previous balance', () => {
    const amount = Money.fromMinor(10000n, 'USD');

    const result = PaymentReceipt.create({
      id: 'rc-03',
      tenantId: 'tenant-01',
      receiptNumber: 'RC-000003',
      customerId: 'cust-01',
      amount,
      paymentMethod: 'ZELLE',
      bankAccountId: 'acc-bank-01',
      receiptDate: new Date('2026-11-24'),
      allocations: [
        {
          invoiceId: 'inv-01',
          amount,
          previousBalance: Money.fromMinor(5000n, 'USD'),
          newBalance: Money.fromMinor(0n, 'USD'),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AllocationExceedsPreviousBalance');
    }
  });

  it('voids an active receipt with reason and timestamp', () => {
    const amount = Money.fromMinor(5000n, 'USD');
    const createRes = PaymentReceipt.create({
      id: 'rc-04',
      tenantId: 'tenant-01',
      receiptNumber: 'RC-000004',
      customerId: 'cust-01',
      amount,
      paymentMethod: 'DEBIT_CARD',
      bankAccountId: 'acc-bank-01',
      receiptDate: new Date('2026-11-24'),
      allocations: [
        {
          invoiceId: 'inv-01',
          amount,
          previousBalance: Money.fromMinor(5000n, 'USD'),
          newBalance: Money.fromMinor(0n, 'USD'),
        },
      ],
    });

    expect(createRes.ok).toBe(true);
    if (createRes.ok) {
      const receipt = createRes.value;
      const voidRes = receipt.void('Cheque rebotado', new Date('2026-11-25'));
      expect(voidRes.ok).toBe(true);
      if (voidRes.ok) {
        expect(voidRes.value.status).toBe('VOIDED');
        expect(voidRes.value.voidReason).toBe('Cheque rebotado');
      }
    }
  });
});
