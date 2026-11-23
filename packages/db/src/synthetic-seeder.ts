export interface SyntheticProduct {
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string;
  readonly priceMinor: bigint;
  readonly onHand: bigint;
}

export interface SyntheticCustomer {
  readonly code: string;
  readonly name: string;
  readonly taxId: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
}

export interface SyntheticAccount {
  readonly code: string;
  readonly name: string;
  readonly type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}

export interface SyntheticTenantSeed {
  readonly jurisdiction: 'VE' | 'US';
  readonly slug: string;
  readonly name: string;
  readonly taxId: string;
  readonly taxIdLabel: string;
  readonly taxLabel: string;
  readonly taxRateBp: number;
  readonly baseCurrency: string;
  readonly isDualCurrency: boolean;
  readonly address: string;
  readonly customers: readonly SyntheticCustomer[];
  readonly products: readonly SyntheticProduct[];
  readonly chartOfAccounts: readonly SyntheticAccount[];
}

export const VENEZUELA_SYNTHETIC_SEED: SyntheticTenantSeed = {
  jurisdiction: 'VE',
  slug: 'empresa-demo-ve',
  name: 'Empresa Demo C.A.',
  taxId: 'J-50123456-7',
  taxIdLabel: 'RIF / C.I.',
  taxLabel: 'IVA (16%)',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  isDualCurrency: true,
  address: 'Av. Francisco de Miranda, Caracas, Venezuela',
  customers: [
    {
      code: 'CLI-0001',
      name: 'Cliente Mostrador General',
      taxId: 'V-00000000',
      email: 'mostrador@empresa-demo.test',
      phone: '+58 212 5550101',
      address: 'Caracas, Venezuela',
    },
    {
      code: 'CLI-0002',
      name: 'Distribuidora Demo Centro C.A.',
      taxId: 'J-51234567-8',
      email: 'compras@distribuidora-demo.test',
      phone: '+58 212 5550102',
      address: 'Valencia, Venezuela',
    },
    {
      code: 'CLI-0003',
      name: 'Inversiones Ficticias S.A.',
      taxId: 'J-52345678-9',
      email: 'administracion@inversiones-ficticias.test',
      phone: '+58 261 5550103',
      address: 'Maracaibo, Venezuela',
    },
  ],
  products: [
    {
      sku: 'SKU-VE-001',
      name: 'Harina de Maíz Precocida 1kg',
      category: 'Alimentos',
      unit: 'unidad',
      priceMinor: 120n,
      onHand: 150000n,
    },
    {
      sku: 'SKU-VE-002',
      name: 'Arroz Blanco Tradicional 1kg',
      category: 'Alimentos',
      unit: 'unidad',
      priceMinor: 110n,
      onHand: 200000n,
    },
    {
      sku: 'SKU-VE-003',
      name: 'Aceite Vegetal Comestible 1L',
      category: 'Alimentos',
      unit: 'unidad',
      priceMinor: 250n,
      onHand: 80000n,
    },
    {
      sku: 'SKU-VE-004',
      name: 'Café Molido Tostado 500g',
      category: 'Bebidas',
      unit: 'unidad',
      priceMinor: 380n,
      onHand: 50000n,
    },
    {
      sku: 'SKU-VE-005',
      name: 'Detergente en Polvo 1kg',
      category: 'Limpieza',
      unit: 'unidad',
      priceMinor: 220n,
      onHand: 90000n,
    },
  ],
  chartOfAccounts: [
    { code: '1.1.01.01.001', name: 'Caja General USD', type: 'asset' },
    { code: '1.1.01.01.002', name: 'Banco Moneda Nacional (VES)', type: 'asset' },
    { code: '1.1.02.01.001', name: 'Cuentas por Cobrar Comerciales', type: 'asset' },
    { code: '1.1.03.01.001', name: 'Inventario de Mercancía', type: 'asset' },
    { code: '2.1.01.01.001', name: 'Cuentas por Pagar Proveedores', type: 'liability' },
    { code: '2.1.02.01.001', name: 'Débito Fiscal IVA por Pagar', type: 'liability' },
    { code: '3.1.01.01.001', name: 'Capital Social Suscrito', type: 'equity' },
    { code: '4.1.01.01.001', name: 'Ingresos por Venta de Mercancía', type: 'revenue' },
    { code: '5.1.01.01.001', name: 'Costo de Ventas de Mercancía', type: 'expense' },
  ],
};

export const UNITED_STATES_SYNTHETIC_SEED: SyntheticTenantSeed = {
  jurisdiction: 'US',
  slug: 'demo-store-us',
  name: 'Demo Store Inc.',
  taxId: '12-3456789',
  taxIdLabel: 'Tax ID / EIN',
  taxLabel: 'Sales Tax (7.00%)',
  taxRateBp: 700,
  baseCurrency: 'USD',
  isDualCurrency: false,
  address: '1000 Brickell Ave, Miami, FL 33131, United States',
  customers: [
    {
      code: 'CUST-0001',
      name: 'Walk-in Retail Customer',
      taxId: '00-0000000',
      email: 'walkin@demostore.test',
      phone: '+1 305 555 0101',
      address: 'Miami, FL, United States',
    },
    {
      code: 'CUST-0002',
      name: 'Retail Demo Partner LLC',
      taxId: '23-4567890',
      email: 'purchasing@retail-demo.test',
      phone: '+1 305 555 0102',
      address: 'Orlando, FL, United States',
    },
    {
      code: 'CUST-0003',
      name: 'Synthetic Enterprise Corp',
      taxId: '34-5678901',
      email: 'accounts@synthetic-corp.test',
      phone: '+1 404 555 0103',
      address: 'Atlanta, GA, United States',
    },
  ],
  products: [
    {
      sku: 'SKU-US-001',
      name: 'Whole Milk 1 Gallon',
      category: 'Dairy',
      unit: 'each',
      priceMinor: 389n,
      onHand: 120000n,
    },
    {
      sku: 'SKU-US-002',
      name: 'White Sandwich Bread 24oz',
      category: 'Bakery',
      unit: 'each',
      priceMinor: 249n,
      onHand: 180000n,
    },
    {
      sku: 'SKU-US-003',
      name: 'Grade A Large Eggs 12ct',
      category: 'Dairy',
      unit: 'each',
      priceMinor: 329n,
      onHand: 95000n,
    },
    {
      sku: 'SKU-US-004',
      name: 'Medium Roast Ground Coffee 12oz',
      category: 'Beverages',
      unit: 'each',
      priceMinor: 799n,
      onHand: 60000n,
    },
    {
      sku: 'SKU-US-005',
      name: 'Liquid Dish Soap 16oz',
      category: 'Household',
      unit: 'each',
      priceMinor: 299n,
      onHand: 110000n,
    },
  ],
  chartOfAccounts: [
    { code: '1010', name: 'Cash and Cash Equivalents', type: 'asset' },
    { code: '1020', name: 'Operating Checking Account', type: 'asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { code: '1200', name: 'Merchandise Inventory', type: 'asset' },
    { code: '2000', name: 'Accounts Payable', type: 'liability' },
    { code: '2100', name: 'Sales Tax Payable', type: 'liability' },
    { code: '3000', name: 'Common Stock & Paid-in Capital', type: 'equity' },
    { code: '4000', name: 'Gross Sales Revenue', type: 'revenue' },
    { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'expense' },
  ],
};

export class SyntheticSeederRegistry {
  private static readonly seeds = new Map<string, SyntheticTenantSeed>();

  static {
    SyntheticSeederRegistry.register('VE', VENEZUELA_SYNTHETIC_SEED);
    SyntheticSeederRegistry.register('US', UNITED_STATES_SYNTHETIC_SEED);
  }

  static register(jurisdiction: string, seed: SyntheticTenantSeed): void {
    SyntheticSeederRegistry.seeds.set(jurisdiction.toUpperCase(), seed);
  }

  static get(jurisdiction: string): SyntheticTenantSeed {
    const seed = SyntheticSeederRegistry.seeds.get(jurisdiction.toUpperCase());
    if (!seed) {
      return VENEZUELA_SYNTHETIC_SEED;
    }
    return seed;
  }

  static has(jurisdiction: string): boolean {
    return SyntheticSeederRegistry.seeds.has(jurisdiction.toUpperCase());
  }
}

export function getSyntheticSeed(jurisdiction: string): SyntheticTenantSeed {
  return SyntheticSeederRegistry.get(jurisdiction);
}
