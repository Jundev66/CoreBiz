import { describe, it, expect } from 'vitest';
import { Payment } from './payment';
import { Money } from '../../shared/value-objects/money';
import { ExchangeRate } from '../../shared/value-objects/exchange-rate';
import {
  asId,
  type CustomerId,
  type DeliveryNoteId,
  type PaymentId,
  type TenantId,
} from '../../shared/entity';

const tenantId = asId<TenantId>('t1');
const customerId = asId<CustomerId>('c1');
const rate = ExchangeRate.fromScaled(40000000n, 'USD', 'VES', new Date('2026-10-14T00:00:00Z'));

describe('Payment Aggregate', () => {
  it('registra un cobro exitosamente cuando las imputaciones cuadran exactamente', () => {
    const amount = Money.fromMinor(10000n, 'USD'); // $100.00
    const note1 = asId<DeliveryNoteId>('dn1');
    const note2 = asId<DeliveryNoteId>('dn2');

    const paymentResult = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'bank_transfer',
      reference: 'TRANS-12345',
      paidAt: new Date('2026-10-14T10:00:00Z'),
      allocations: [
        { deliveryNoteId: note1, amount: Money.fromMinor(6000n, 'USD') },
        { deliveryNoteId: note2, amount: Money.fromMinor(4000n, 'USD') },
      ],
    });

    expect(paymentResult.ok).toBe(true);
    if (!paymentResult.ok) return;

    const payment = paymentResult.value;
    expect(payment.number).toBe('REC-000001');
    expect(payment.status).toBe('applied');
    expect(payment.allocations).toHaveLength(2);
    expect(payment.reference).toBe('TRANS-12345');

    const events = payment.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('payment.received');
  });

  it('falla si la suma de imputaciones no coincide con el total del cobro', () => {
    const amount = Money.fromMinor(10000n, 'USD'); // $100.00
    const note1 = asId<DeliveryNoteId>('dn1');

    const paymentResult = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'cash_usd',
      paidAt: new Date(),
      allocations: [
        { deliveryNoteId: note1, amount: Money.fromMinor(9000n, 'USD') }, // Falta $10.00
      ],
    });

    expect(paymentResult.ok).toBe(false);
    if (paymentResult.ok) return;
    expect(paymentResult.error.kind).toBe('AllocationMismatch');
  });

  it('falla si no hay imputaciones', () => {
    const amount = Money.fromMinor(5000n, 'USD');

    const paymentResult = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'cash_usd',
      paidAt: new Date(),
      allocations: [],
    });

    expect(paymentResult.ok).toBe(false);
    if (paymentResult.ok) return;
    expect(paymentResult.error.kind).toBe('NoAllocations');
  });

  it('falla si el monto es negativo o cero', () => {
    const zero = Money.zero('USD');

    const paymentResult = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount: zero,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'cash_usd',
      paidAt: new Date(),
      allocations: [{ deliveryNoteId: asId<DeliveryNoteId>('dn1'), amount: zero }],
    });

    expect(paymentResult.ok).toBe(false);
    if (paymentResult.ok) return;
    expect(paymentResult.error.kind).toBe('OutOfRange');
  });

  it('permite anular un cobro aplicado con motivo válido', () => {
    const amount = Money.fromMinor(10000n, 'USD');
    const payment = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'cash_usd',
      paidAt: new Date(),
      allocations: [{ deliveryNoteId: asId<DeliveryNoteId>('dn1'), amount }],
    });

    expect(payment.ok).toBe(true);
    if (!payment.ok) return;

    const p = payment.value;
    p.pullDomainEvents();

    const voidResult = p.void('Cheque devuelto por fondos insuficientes', new Date());
    expect(voidResult.ok).toBe(true);
    expect(p.status).toBe('voided');
    expect(p.voidReason).toBe('Cheque devuelto por fondos insuficientes');

    const events = p.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('payment.voided');

    // Intentar anular de nuevo falla
    const secondVoid = p.void('Otro motivo', new Date());
    expect(secondVoid.ok).toBe(false);
    if (secondVoid.ok) return;
    expect(secondVoid.error.kind).toBe('AlreadyVoided');
  });

  it('falla al anular si el motivo es muy corto', () => {
    const amount = Money.fromMinor(10000n, 'USD');
    const payment = Payment.receive({
      id: asId<PaymentId>('p1'),
      tenantId,
      number: 'REC-000001',
      customerId,
      amount,
      currency: 'USD',
      exchangeRate: rate,
      paymentMethod: 'cash_usd',
      paidAt: new Date(),
      allocations: [{ deliveryNoteId: asId<DeliveryNoteId>('dn1'), amount }],
    });

    expect(payment.ok).toBe(true);
    if (!payment.ok) return;

    const p = payment.value;
    const voidResult = p.void('no', new Date());
    expect(voidResult.ok).toBe(false);
    if (voidResult.ok) return;
    expect(voidResult.error.kind).toBe('TooShort');
  });
});
