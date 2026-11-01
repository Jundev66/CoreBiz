import { Supplier, asId, type SupplierId, type TenantId } from '@corebiz/domain';

export class SupplierMother {
  static create(overrides: Partial<Parameters<typeof Supplier.create>[0]> = {}): Supplier {
    const id = overrides.id ?? asId<SupplierId>('018e245a-0000-7000-8000-000000000401');
    const tenantId = overrides.tenantId ?? asId<TenantId>('tenant-demo');
    const code = overrides.code ?? 'PRV-0001';
    const name = overrides.name ?? 'Distribuidora Central C.A.';
    const taxId = overrides.taxId ?? 'J-12345678-9';
    const email = overrides.email ?? 'contacto@distribuidoracentral.com';
    const phone = overrides.phone ?? '+584121234567';
    const contactName = overrides.contactName ?? 'Carlos Mendoza';
    const notes = overrides.notes ?? 'Proveedor principal de bebidas';
    const createdAt = overrides.createdAt ?? new Date('2026-01-01T08:00:00Z');

    const result = Supplier.create({
      id,
      tenantId,
      code,
      name,
      taxId,
      email,
      phone,
      contactName,
      notes,
      createdAt,
      ...overrides,
    });

    if (!result.ok) {
      throw new Error(`Failed to create Supplier in mother: ${JSON.stringify(result.error)}`);
    }

    return result.value;
  }

  static archived(): Supplier {
    const supplier = this.create();
    supplier.archive(new Date('2026-02-01T10:00:00Z'));
    return supplier;
  }
}
