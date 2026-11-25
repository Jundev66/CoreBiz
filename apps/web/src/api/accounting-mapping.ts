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

export function accountMappingCookieName(tenantId: string): string {
  return `corebiz_acc_map_${tenantId}`;
}

export async function readCompanyAccountMapping(
  tenantId: string,
  accounts: readonly AccountApiItem[],
): Promise<CompanyAccountMapping> {
  const findAccount = (codes: string[], fallbackCategory: string, fallbackId: string) =>
    accounts.find((a) => codes.includes(a.code))?.id ??
    accounts.find((a) => a.category === fallbackCategory)?.id ??
    fallbackId;

  const defaults: CompanyAccountMapping = {
    cashAccountId: findAccount(['1.1.01', '1010'], 'ASSET', 'tpl-1.1.01'),
    receivableAccountId: findAccount(['1.1.02', '1200'], 'ASSET', 'tpl-1.1.02'),
    inventoryAccountId: findAccount(['1.1.03', '1400'], 'ASSET', 'tpl-1.1.03'),
    payableAccountId: findAccount(['2.1.01', '2010'], 'LIABILITY', 'tpl-2.1.01'),
    taxPayableAccountId: findAccount(['2.1.02', '2050'], 'LIABILITY', 'tpl-2.1.02'),
    taxCreditAccountId: findAccount(['1.1.05', '2.1.02', '2050'], 'LIABILITY', 'tpl-2.1.02'),
    revenueAccountId: findAccount(['4.1.01', '4010'], 'REVENUE', 'tpl-4.1.01'),
    cogsAccountId: findAccount(['5.1.01', '5010'], 'COGS', 'tpl-5.1.01'),
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
