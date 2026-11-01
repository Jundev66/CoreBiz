import {
  Product,
  Money,
  Quantity,
  asId,
  unwrap,
  type ProductId,
  type TenantId,
  type Currency,
} from '@corebiz/domain';

export class ProductMother {
  static create(overrides: Partial<Parameters<typeof Product.create>[0]> = {}): Product {
    const defaultPrice = unwrap(Money.of('25.00', 'USD'));
    const result = Product.create({
      id: overrides.id ?? asId<ProductId>('018e245a-0000-7000-8000-000000000010'),
      tenantId: overrides.tenantId ?? asId<TenantId>('018e245a-0000-7000-8000-000000000001'),
      sku: overrides.sku ?? 'PRD26000001',
      name: overrides.name ?? 'Harina de Trigo 1kg',
      price: overrides.price ?? defaultPrice,
      cost: overrides.cost ?? null,
      unit: overrides.unit ?? 'und',
      initialStock: overrides.initialStock ?? unwrap(Quantity.of('100')),
      minStock: overrides.minStock ?? unwrap(Quantity.of('10')),
      trackStock: overrides.trackStock ?? true,
      taxable: overrides.taxable ?? true,
      createdAt: overrides.createdAt ?? new Date('2026-01-01T12:00:00.000Z'),
    });

    if (!result.ok) {
      throw new Error(`ProductMother error: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }

  static withStock(quantity: string): Product {
    return this.create({ initialStock: unwrap(Quantity.of(quantity)) });
  }

  static withPrice(amount: string, currency: Currency = 'USD'): Product {
    return this.create({ price: unwrap(Money.of(amount, currency)) });
  }

  static archived(): Product {
    const product = this.create();
    product.archive(new Date());
    return product;
  }
}
