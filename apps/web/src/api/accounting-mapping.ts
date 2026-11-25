import 'server-only';
import { cookies } from 'next/headers';
import type { AccountApiItem } from './accounting';

export interface CompanyAccountMapping {
  readonly cashAccountId: string;
  readonly receivableAccountId: string;
  readonly inventoryAccountId: string;
  readonly payableAccountId: string;
  readonly taxPayableAccountId: string;
  readonly taxCreditAccountId: string;
  readonly revenueAccountId: string;
  readonly cogsAccountId: string;
}

export interface AccountingConfigStatus {
  readonly isConfigured: boolean;
  readonly hasExplicitMapping: boolean;
  readonly missingRoles: readonly string[];
}

export function accountMappingCookieName(tenantId: string): string {
  return `corebiz_acc_map_${tenantId}`;
}

export function productTaxCookieName(tenantId: string): string {
  return `corebiz_prod_tax_${tenantId}`;
}

export async function readProductTaxMap(tenantId: string): Promise<Record<string, string>> {
  try {
    const store = await cookies();
    const raw = store.get(productTaxCookieName(tenantId))?.value;
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function readCompanyAccountMapping(
  tenantId: string,
  accounts: readonly AccountApiItem[],
): Promise<CompanyAccountMapping> {
  const findAccount = (codes: string[], fallbackCategory: string) =>
    accounts.find((a) => codes.includes(a.code))?.id ??
    accounts.find((a) => a.category === fallbackCategory)?.id ??
    '';

  const defaults: CompanyAccountMapping = {
    cashAccountId: findAccount(['1.1.01', '1010'], 'ASSET'),
    receivableAccountId: findAccount(['1.1.02', '1200'], 'ASSET'),
    inventoryAccountId: findAccount(['1.1.03', '1400'], 'ASSET'),
    payableAccountId: findAccount(['2.1.01', '2010'], 'LIABILITY'),
    taxPayableAccountId: findAccount(['2.1.02', '2050'], 'LIABILITY'),
    taxCreditAccountId: findAccount(['1.1.05', '2.1.02', '2050'], 'LIABILITY'),
    revenueAccountId: findAccount(['4.1.01', '4010'], 'REVENUE'),
    cogsAccountId: findAccount(['5.1.01', '5010'], 'COGS'),
  };

  try {
    const store = await cookies();
    const raw = store.get(accountMappingCookieName(tenantId))?.value;
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<CompanyAccountMapping>;
    return {
      cashAccountId: parsed.cashAccountId || defaults.cashAccountId,
      receivableAccountId: parsed.receivableAccountId || defaults.receivableAccountId,
      inventoryAccountId: parsed.inventoryAccountId || defaults.inventoryAccountId,
      payableAccountId: parsed.payableAccountId || defaults.payableAccountId,
      taxPayableAccountId: parsed.taxPayableAccountId || defaults.taxPayableAccountId,
      taxCreditAccountId: parsed.taxCreditAccountId || defaults.taxCreditAccountId,
      revenueAccountId: parsed.revenueAccountId || defaults.revenueAccountId,
      cogsAccountId: parsed.cogsAccountId || defaults.cogsAccountId,
    };
  } catch {
    return defaults;
  }
}

export async function readAccountingConfigStatus(
  tenantId: string,
  accounts: readonly AccountApiItem[],
  requiredKeys: readonly (keyof CompanyAccountMapping)[],
): Promise<AccountingConfigStatus> {
  const mapping = await readCompanyAccountMapping(tenantId, accounts);
  const store = await cookies();
  const hasExplicitMapping = Boolean(store.get(accountMappingCookieName(tenantId))?.value);
  const validIds = new Set(accounts.map((a) => a.id));

  const roleLabels: Record<keyof CompanyAccountMapping, string> = {
    cashAccountId: 'Caja / Bancos',
    receivableAccountId: 'Cuentas por Cobrar',
    inventoryAccountId: 'Inventario',
    payableAccountId: 'Cuentas por Pagar',
    taxPayableAccountId: 'IVA Débito Fiscal',
    taxCreditAccountId: 'IVA Crédito Fiscal',
    revenueAccountId: 'Ingresos por Ventas',
    cogsAccountId: 'Costo de Ventas',
  };

  const missingRoles: string[] = [];
  for (const key of requiredKeys) {
    const id = mapping[key];
    if (!id || !validIds.has(id)) {
      missingRoles.push(roleLabels[key]);
    }
  }

  return {
    isConfigured: accounts.length > 0 && missingRoles.length === 0,
    hasExplicitMapping,
    missingRoles,
  };
}
