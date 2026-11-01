import {
  Payment,
  Money,
  ExchangeRate,
  asId,
  unwrap,
  type PaymentId,
  type CustomerId,
  type DeliveryNoteId,
  type TenantId,
} from '@corebiz/domain';

export class PaymentMother {
  static create(overrides: Partial<Parameters<typeof Payment.receive>[0]> = {}): Payment {
    const id = overrides.id ?? asId<PaymentId>('018e245a-0000-7000-8000-000000000601');
    const tenantId = overrides.tenantId ?? asId<TenantId>('tenant-demo');
    const number = overrides.number ?? 'REC-000001';
    const customerId =
      overrides.customerId ?? asId<CustomerId>('018e245a-0000-7000-8000-000000000002');
    const currency = overrides.currency ?? 'USD';
    const amount = overrides.amount ?? unwrap(Money.of('50.00', currency));
    const rate =
      overrides.exchangeRate ??
      unwrap(ExchangeRate.of('36.50', 'USD', 'VES', new Date('2026-03-15T12:00:00.000Z')));
    const paymentMethod = overrides.paymentMethod ?? 'cash_usd';
    const paidAt = overrides.paidAt ?? new Date('2026-03-15T12:00:00.000Z');
    const allocations = overrides.allocations ?? [
      {
        deliveryNoteId: asId<DeliveryNoteId>('018e245a-0000-7000-8000-000000000050'),
        amount: unwrap(Money.of('50.00', currency)),
      },
    ];

    const result = Payment.receive({
      id,
      tenantId,
      number,
      customerId,
      amount,
      currency,
      exchangeRate: rate,
      paymentMethod,
      paidAt,
      allocations,
      reference: overrides.reference ?? 'REF-PAY-001',
      notes: overrides.notes ?? 'Pago regular',
      ...overrides,
    });

    if (!result.ok) {
      throw new Error(`PaymentMother error: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }
}
