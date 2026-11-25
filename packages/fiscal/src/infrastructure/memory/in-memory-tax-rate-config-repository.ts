import { TaxRateConfig } from '../../domain/model/tax-rate-config';
import type { TaxRateConfigRepository } from '../../domain/port/tax-rate-config-repository';

export class InMemoryTaxRateConfigRepository implements TaxRateConfigRepository {
  private readonly storage = new Map<string, TaxRateConfig>();

  private seedDefaultsIfEmpty(tenantId: string, jurisdiction: 'VE' | 'US'): void {
    const hasAny = Array.from(this.storage.values()).some((t) => t.tenantId === tenantId);
    if (hasAny) return;

    const defaults =
      jurisdiction === 'US'
        ? [
            { code: 'US_TAX_7', name: 'Standard Sales Tax (7%)', rateBp: 700, isDefault: true },
            { code: 'EXEMPT', name: 'Tax Exempt (0%)', rateBp: 0, isDefault: false },
          ]
        : [
            { code: 'IVA_16', name: 'IVA General (16%)', rateBp: 1600, isDefault: true },
            { code: 'IVA_8', name: 'IVA Reducido (8%)', rateBp: 800, isDefault: false },
            { code: 'EXENTO', name: 'Exento (0%)', rateBp: 0, isDefault: false },
          ];

    for (const item of defaults) {
      const id = `${tenantId}-tax-${item.code.toLowerCase()}`;
      const created = TaxRateConfig.create({
        id,
        tenantId,
        code: item.code,
        name: item.name,
        rateBp: item.rateBp,
        jurisdiction,
        isDefault: item.isDefault,
        isActive: true,
      });
      if (created.ok) {
        this.storage.set(id, created.value);
      }
    }
  }

  listByTenant(
    tenantId: string,
    defaultJurisdiction: 'VE' | 'US' = 'VE',
  ): Promise<readonly TaxRateConfig[]> {
    this.seedDefaultsIfEmpty(tenantId, defaultJurisdiction);
    const items = Array.from(this.storage.values())
      .filter((t) => t.tenantId === tenantId)
      .sort((a, b) => b.rateBp - a.rateBp);
    return Promise.resolve(items);
  }

  findById(tenantId: string, id: string): Promise<TaxRateConfig | null> {
    const found = this.storage.get(id);
    if (!found || found.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(found);
  }

  save(taxRate: TaxRateConfig): Promise<void> {
    if (taxRate.isDefault) {
      for (const [id, existing] of this.storage.entries()) {
        if (existing.tenantId === taxRate.tenantId && existing.isDefault && id !== taxRate.id) {
          this.storage.set(id, existing.withDefault(false));
        }
      }
    }
    this.storage.set(taxRate.id, taxRate);
    return Promise.resolve();
  }

  setDefault(tenantId: string, id: string): Promise<boolean> {
    const target = this.storage.get(id);
    if (!target || target.tenantId !== tenantId) {
      return Promise.resolve(false);
    }
    for (const [key, existing] of this.storage.entries()) {
      if (existing.tenantId === tenantId) {
        this.storage.set(key, existing.withDefault(key === id));
      }
    }
    return Promise.resolve(true);
  }
}
