import {
  GoodsReceipt,
  Money,
  Quantity,
  asId,
  unwrap,
  type ProductId,
  type SupplierId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';

export class GoodsReceiptMother {
  static create(overrides: Partial<Parameters<typeof GoodsReceipt.receive>[0]> = {}): GoodsReceipt {
    const id = overrides.id ?? '018e245a-0000-7000-8000-000000000501';
    const tenantId = overrides.tenantId ?? asId<TenantId>('tenant-demo');
    const number = overrides.number ?? 'REC-2026-0001';
    const supplierId =
      overrides.supplierId ?? asId<SupplierId>('018e245a-0000-7000-8000-000000000401');
    const currency = overrides.currency ?? 'USD';
    const lines = overrides.lines ?? [
      {
        product: {
          id: asId<ProductId>('018e245a-0000-7000-8000-000000000101'),
          name: 'Harina de Trigo 1kg',
          unit: 'kg',
          trackStock: true,
        },
        quantity: unwrap(Quantity.of('10')),
        unitCost: unwrap(Money.of('25.00', 'USD')),
      },
    ];
    const receivedAt = overrides.receivedAt ?? new Date('2026-01-15T10:00:00Z');
    const receivedBy = overrides.receivedBy ?? asId<UserId>('user-demo-admin');

    const result = GoodsReceipt.receive({
      id,
      tenantId,
      number,
      supplierId,
      currency,
      lines,
      receivedAt,
      receivedBy,
      supplierReference: overrides.supplierReference ?? 'REF-001',
      notes: overrides.notes ?? 'Entrega puntual',
      ...overrides,
    });

    if (!result.ok) {
      throw new Error(`Failed to create GoodsReceipt in mother: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }
}
