import { Account } from '../model/account';
import { AccountCode } from '../model/account-code';
import type { AccountCategory } from '../model/account-type';

export interface AccountTemplateItem {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly isReconcilable: boolean;
}

const VENEZUELA_CHART_TEMPLATE: readonly AccountTemplateItem[] = [
  { code: '1.1.01', name: 'Caja y Bancos', category: 'ASSET', isReconcilable: true },
  {
    code: '1.1.02',
    name: 'Cuentas por Cobrar Comerciales',
    category: 'ASSET',
    isReconcilable: true,
  },
  { code: '1.1.03', name: 'Inventario de Mercancias', category: 'ASSET', isReconcilable: false },
  { code: '1.1.04', name: 'Criptoactivos y Divisas', category: 'ASSET', isReconcilable: true },
  { code: '1.2.01', name: 'Cuentas por Cobrar a Socios', category: 'ASSET', isReconcilable: true },
  {
    code: '2.1.01',
    name: 'Cuentas por Pagar Proveedores',
    category: 'LIABILITY',
    isReconcilable: true,
  },
  {
    code: '2.1.02',
    name: 'Debito Fiscal IVA por Enterar',
    category: 'LIABILITY',
    isReconcilable: false,
  },
  {
    code: '2.1.03',
    name: 'Retenciones de IVA por Enterar',
    category: 'LIABILITY',
    isReconcilable: false,
  },
  { code: '2.1.04', name: 'IGTF por Pagar', category: 'LIABILITY', isReconcilable: false },
  { code: '3.1.01', name: 'Capital Social', category: 'EQUITY', isReconcilable: false },
  {
    code: '3.1.02',
    name: 'Retiros y Dividendos de Socios',
    category: 'EQUITY',
    isReconcilable: false,
  },
  { code: '4.1.01', name: 'Ingresos por Ventas', category: 'REVENUE', isReconcilable: false },
  { code: '5.1.01', name: 'Costo de Ventas', category: 'COGS', isReconcilable: false },
  { code: '6.1.01', name: 'Gastos Operativos', category: 'EXPENSE', isReconcilable: false },
  {
    code: '6.1.02',
    name: 'Comisiones Bancarias y Financieras',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  {
    code: '6.1.03',
    name: 'Logística, Fletes y Transporte',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  {
    code: '6.1.04',
    name: 'Servicios Públicos y Alquiler',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  {
    code: '6.1.05',
    name: 'Mantenimiento y Suministros',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  {
    code: '6.1.06',
    name: 'Aranceles y Trámites Aduanales',
    category: 'EXPENSE',
    isReconcilable: false,
  },
];

const US_GAAP_CHART_TEMPLATE: readonly AccountTemplateItem[] = [
  { code: '1010', name: 'Cash and Cash Equivalents', category: 'ASSET', isReconcilable: true },
  {
    code: '1040',
    name: 'Digital Assets and Crypto Holdings',
    category: 'ASSET',
    isReconcilable: true,
  },
  { code: '1200', name: 'Accounts Receivable', category: 'ASSET', isReconcilable: true },
  { code: '1250', name: 'Due from Shareholders', category: 'ASSET', isReconcilable: true },
  { code: '1400', name: 'Inventory Asset', category: 'ASSET', isReconcilable: false },
  { code: '2010', name: 'Accounts Payable', category: 'LIABILITY', isReconcilable: true },
  { code: '2050', name: 'Sales Tax Payable', category: 'LIABILITY', isReconcilable: false },
  { code: '3010', name: 'Owners Equity', category: 'EQUITY', isReconcilable: false },
  {
    code: '3020',
    name: 'Owner Drawings and Distributions',
    category: 'EQUITY',
    isReconcilable: false,
  },
  { code: '4010', name: 'Sales Revenue', category: 'REVENUE', isReconcilable: false },
  { code: '5010', name: 'Cost of Goods Sold', category: 'COGS', isReconcilable: false },
  { code: '6010', name: 'Operating Expenses', category: 'EXPENSE', isReconcilable: false },
  {
    code: '6020',
    name: 'Freight and Shipping Logistics',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  { code: '6030', name: 'Rent and Utilities', category: 'EXPENSE', isReconcilable: false },
  {
    code: '6040',
    name: 'Repairs, Supplies and Maintenance',
    category: 'EXPENSE',
    isReconcilable: false,
  },
  { code: '6050', name: 'Bank and Processing Fees', category: 'EXPENSE', isReconcilable: false },
  {
    code: '6060',
    name: 'Customs Duties and Import Taxes',
    category: 'EXPENSE',
    isReconcilable: false,
  },
];

export class ChartOfAccountsRegistry {
  private static readonly templates = new Map<string, readonly AccountTemplateItem[]>();

  static {
    ChartOfAccountsRegistry.register('VE', VENEZUELA_CHART_TEMPLATE);
    ChartOfAccountsRegistry.register('US', US_GAAP_CHART_TEMPLATE);
  }

  static register(jurisdiction: string, template: readonly AccountTemplateItem[]): void {
    ChartOfAccountsRegistry.templates.set(jurisdiction.toUpperCase(), template);
  }

  static get(jurisdiction: string): readonly AccountTemplateItem[] {
    const template = ChartOfAccountsRegistry.templates.get(jurisdiction.toUpperCase());
    if (!template) {
      throw new Error(`No chart of accounts template registered for jurisdiction: ${jurisdiction}`);
    }
    return template;
  }

  static has(jurisdiction: string): boolean {
    return ChartOfAccountsRegistry.templates.has(jurisdiction.toUpperCase());
  }
}

export function createDefaultAccountsForJurisdiction(
  tenantId: string,
  jurisdiction: string,
): readonly Account[] {
  const template = ChartOfAccountsRegistry.get(jurisdiction);

  return template.map((item, index) => {
    const codeResult = AccountCode.create(item.code);
    if (!codeResult.ok) {
      throw new Error(`Invalid code in template: ${item.code}`);
    }

    return new Account({
      id: `${tenantId}-acc-${index + 1}`,
      tenantId,
      code: codeResult.value,
      name: item.name,
      category: item.category,
      isReconcilable: item.isReconcilable,
      isActive: true,
    });
  });
}
