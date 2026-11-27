export type PosJurisdiction = 'VE' | 'US' | (string & {});

export interface PosPaymentOption {
  readonly id: string;
  readonly label: string;
  readonly domainMethod: 'cash' | 'card' | 'transfer' | 'split';
}

export interface PosCountryConfig {
  readonly jurisdiction: PosJurisdiction;
  readonly countryName: string;
  readonly defaultCurrency: string;
  readonly taxRateBp: bigint;
  readonly igtfRateBp?: bigint;
  readonly taxLabel: string;
  readonly taxIdLabel: string;
  readonly isDualCurrency: boolean;
  readonly paymentOptions: readonly PosPaymentOption[];
  readonly storeName: string;
  readonly storeTaxId: string;
  readonly storeAddress: string;
  readonly receiptTitle: string;
  readonly receiptSubtitle: string;
}

export const VENEZUELA_POS_CONFIG: PosCountryConfig = {
  jurisdiction: 'VE',
  countryName: 'Venezuela',
  defaultCurrency: 'USD',
  taxRateBp: 1600n,
  igtfRateBp: 300n,
  taxLabel: 'IVA (16%)',
  taxIdLabel: 'RIF / C.I.',
  isDualCurrency: true,
  paymentOptions: [
    { id: 'cash_usd', label: 'Efectivo USD', domainMethod: 'cash' },
    { id: 'cash_ves', label: 'Efectivo Bs.', domainMethod: 'cash' },
    { id: 'pago_movil', label: 'Pago Móvil', domainMethod: 'transfer' },
    { id: 'punto_debito', label: 'Punto de Venta', domainMethod: 'card' },
    { id: 'biopago', label: 'Biopago', domainMethod: 'card' },
  ],
  storeName: 'Empresa Demo C.A.',
  storeTaxId: 'RIF: J-50123456-7',
  storeAddress: 'Av. Francisco de Miranda, Caracas, Venezuela',
  receiptTitle: 'COMPROBANTE DE ENTREGA',
  receiptSubtitle: 'DOCUMENTO INTERNO NO FISCAL',
};

export const UNITED_STATES_POS_CONFIG: PosCountryConfig = {
  jurisdiction: 'US',
  countryName: 'United States',
  defaultCurrency: 'USD',
  taxRateBp: 700n,
  igtfRateBp: 0n,
  taxLabel: 'Sales Tax (7.00%)',
  taxIdLabel: 'Tax ID / EIN',
  isDualCurrency: false,
  paymentOptions: [
    { id: 'cash_usd', label: 'Cash (USD)', domainMethod: 'cash' },
    { id: 'card', label: 'Credit / Debit Card', domainMethod: 'card' },
    { id: 'check', label: 'Check / ACH', domainMethod: 'transfer' },
    { id: 'digital_wallet', label: 'Digital Wallet', domainMethod: 'card' },
  ],
  storeName: 'Demo Store Inc.',
  storeTaxId: 'EIN: 12-3456789',
  storeAddress: 'Miami, FL, United States',
  receiptTitle: 'SALES RECEIPT',
  receiptSubtitle: 'OFFICIAL PURCHASE RECEIPT',
};

export class PosJurisdictionRegistry {
  private static readonly configs = new Map<string, PosCountryConfig>();

  static {
    PosJurisdictionRegistry.register('VE', VENEZUELA_POS_CONFIG);
    PosJurisdictionRegistry.register('US', UNITED_STATES_POS_CONFIG);
  }

  static register(jurisdiction: string, config: PosCountryConfig): void {
    PosJurisdictionRegistry.configs.set(jurisdiction.toUpperCase(), config);
  }

  static get(jurisdiction: string): PosCountryConfig {
    const config = PosJurisdictionRegistry.configs.get(jurisdiction.toUpperCase());
    if (!config) {
      return VENEZUELA_POS_CONFIG;
    }
    return config;
  }

  static has(jurisdiction: string): boolean {
    return PosJurisdictionRegistry.configs.has(jurisdiction.toUpperCase());
  }
}

export function getJurisdictionConfig(jurisdiction: string): PosCountryConfig {
  return PosJurisdictionRegistry.get(jurisdiction);
}
