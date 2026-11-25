import type { TaxRateConfig } from '../model/tax-rate-config';

export interface TaxRateConfigRepository {
  listByTenant(
    tenantId: string,
    defaultJurisdiction?: 'VE' | 'US',
  ): Promise<readonly TaxRateConfig[]>;
  findById(tenantId: string, id: string): Promise<TaxRateConfig | null>;
  save(taxRate: TaxRateConfig): Promise<void>;
  setDefault(tenantId: string, id: string): Promise<boolean>;
}
