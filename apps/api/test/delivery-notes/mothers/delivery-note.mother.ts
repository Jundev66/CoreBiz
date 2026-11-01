import {
  DeliveryNote,
  ExchangeRate,
  Money,
  Quantity,
  asId,
  unwrap,
  type DeliveryNoteId,
  type CustomerId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import { ProductMother } from '../../products/mothers/product.mother';

export class DeliveryNoteMother {
  static create(overrides: Partial<Parameters<typeof DeliveryNote.issue>[0]> = {}): DeliveryNote {
    const defaultProduct = ProductMother.create();
    const rate = unwrap(
      ExchangeRate.of('36.50', 'USD', 'VES', new Date('2026-03-15T12:00:00.000Z')),
    );

    const result = DeliveryNote.issue({
      id: overrides.id ?? asId<DeliveryNoteId>('018e245a-0000-7000-8000-000000000050'),
      tenantId: overrides.tenantId ?? asId<TenantId>('018e245a-0000-7000-8000-000000000001'),
      customerId: overrides.customerId ?? asId<CustomerId>('018e245a-0000-7000-8000-000000000002'),
      number: overrides.number ?? 'NOT-000001',
      issuedBy: overrides.issuedBy ?? asId<UserId>('018e245a-0000-7000-8000-000000000003'),
      exchangeRate: overrides.exchangeRate ?? rate,
      currency: overrides.currency ?? 'USD',
      taxLabel: overrides.taxLabel ?? 'IVA',
      taxRateBp: overrides.taxRateBp ?? 1600,
      lines: overrides.lines ?? [
        {
          product: defaultProduct,
          quantity: unwrap(Quantity.of('2')),
          unitPrice: unwrap(Money.of('25.00', 'USD')),
          discountBp: 0,
        },
      ],
      notes: overrides.notes ?? 'Entrega regular',
      issuedAt: overrides.issuedAt ?? new Date('2026-03-15T12:00:00.000Z'),
    });

    if (!result.ok) {
      throw new Error(`DeliveryNoteMother error: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }
}
