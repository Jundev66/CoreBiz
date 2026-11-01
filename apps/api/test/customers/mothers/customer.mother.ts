import { Customer, Money, asId, unwrap, type CustomerId, type TenantId } from '@corebiz/domain';

export class CustomerMother {
  static create(overrides: Partial<Parameters<typeof Customer.create>[0]> = {}): Customer {
    const id = overrides.id ?? asId<CustomerId>('018e245a-0000-7000-8000-000000000002');
    const tenantId = overrides.tenantId ?? asId<TenantId>('tenant-demo');
    const code = overrides.code ?? 'CLI-0001';
    const name = overrides.name ?? 'Bodegón Bella Vista';
    const taxId = overrides.taxId ?? 'J-12345678-0';
    const email = overrides.email ?? 'contacto@bellavista.com';
    const phone = overrides.phone ?? '+584141234567';
    const address = overrides.address ?? {
      line1: 'Calle Principal #12',
      city: 'Maracaibo',
      state: 'Zulia',
    };
    const creditLimit = overrides.creditLimit ?? unwrap(Money.of('500.00', 'USD'));
    const createdAt = overrides.createdAt ?? new Date('2026-01-01T08:00:00Z');

    const result = Customer.create({
      id,
      tenantId,
      code,
      name,
      taxId,
      email,
      phone,
      address,
      creditLimit,
      createdAt,
      ...overrides,
    });

    if (!result.ok) {
      throw new Error(`CustomerMother error: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }

  static archived(): Customer {
    const customer = this.create();
    customer.archive(new Date('2026-02-01T10:00:00Z'));
    return customer;
  }
}
