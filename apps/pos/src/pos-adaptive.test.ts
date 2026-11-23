import { describe, expect, it } from 'vitest';
import {
  PosJurisdictionRegistry,
  getJurisdictionConfig,
  type PosCountryConfig,
} from './config/pos-jurisdiction';
import { formatReceiptHtml } from './receipt';
import type { LocalSale } from './db';

describe('Adaptive POS Jurisdiction Registry', () => {
  it('resolves Venezuela configuration by default and by key', () => {
    const configVe = getJurisdictionConfig('VE');
    expect(configVe.jurisdiction).toBe('VE');
    expect(configVe.countryName).toBe('Venezuela');
    expect(configVe.taxRateBp).toBe(1600n);
    expect(configVe.isDualCurrency).toBe(true);
    expect(configVe.taxLabel).toContain('IVA');
    expect(configVe.taxIdLabel).toContain('RIF');

    const configUnknown = getJurisdictionConfig('XX');
    expect(configUnknown.jurisdiction).toBe('VE');
  });

  it('resolves United States configuration with single currency and Sales Tax', () => {
    const configUs = getJurisdictionConfig('US');
    expect(configUs.jurisdiction).toBe('US');
    expect(configUs.countryName).toBe('United States');
    expect(configUs.taxRateBp).toBe(700n);
    expect(configUs.isDualCurrency).toBe(false);
    expect(configUs.taxLabel).toContain('Sales Tax');
    expect(configUs.taxIdLabel).toContain('EIN');
    expect(configUs.receiptTitle).toBe('SALES RECEIPT');
  });

  it('allows registering a new country jurisdiction dynamically', () => {
    const colombiaConfig: PosCountryConfig = {
      jurisdiction: 'CO',
      countryName: 'Colombia',
      defaultCurrency: 'COP',
      taxRateBp: 1900n,
      taxLabel: 'IVA (19%)',
      taxIdLabel: 'NIT / CC',
      isDualCurrency: false,
      paymentOptions: [
        { id: 'cash_cop', label: 'Efectivo (COP)', domainMethod: 'cash' },
        { id: 'card', label: 'Tarjeta Débito/Crédito', domainMethod: 'card' },
      ],
      storeName: 'Tienda Demo Colombia S.A.S.',
      storeTaxId: 'NIT: 900.123.456-7',
      storeAddress: 'Bogota, Colombia',
      receiptTitle: 'FACTURA DE VENTA POS',
      receiptSubtitle: 'SISTEMA POS ELECTRONICO',
    };

    PosJurisdictionRegistry.register('CO', colombiaConfig);
    expect(PosJurisdictionRegistry.has('CO')).toBe(true);

    const resolved = getJurisdictionConfig('CO');
    expect(resolved.jurisdiction).toBe('CO');
    expect(resolved.taxRateBp).toBe(1900n);
    expect(resolved.storeName).toBe('Tienda Demo Colombia S.A.S.');
  });
});

describe('Adaptive POS Receipt Formatter', () => {
  const baseSale: LocalSale = {
    id: '019345a0-0000-7000-8000-000000000001',
    operationId: '019345a0-0000-7000-8000-000000000001',
    ticketNumber: 'TKT-US-001',
    receiptSequenceNumber: '00-00009999',
    customerName: 'Customer Test 01',
    customerDoc: '12-3456789',
    shiftId: 'shift-us-1',
    registerCode: 'POS-US-01',
    paymentMethod: 'card',
    paymentReference: 'AUTH-9988',
    subtotalMinor: '1000',
    taxMinor: '70',
    totalMinor: '1070',
    lines: [
      {
        id: 'line-1',
        productId: 'prod-1',
        name: 'Item Sample',
        quantity: 1,
        unitPriceMinor: '1000',
        lineTotalMinor: '1000',
      },
    ],
    occurredAt: '2026-11-23T12:00:00.000Z',
    syncStatus: 'synced',
  };

  it('renders United States official sales receipt without dual currency or BCV', () => {
    const usSale: LocalSale = {
      ...baseSale,
      country: 'US',
      taxRateBp: '700',
    };

    const html = formatReceiptHtml(usSale);

    expect(html).toContain('Demo Store Inc.');
    expect(html).toContain('EIN: 12-3456789');
    expect(html).toContain('SALES RECEIPT');
    expect(html).toContain('OFFICIAL PURCHASE RECEIPT');
    expect(html).toContain('Sales Tax (7.00%)');
    expect(html).toContain('$10.70');
    expect(html).not.toContain('BCV');
    expect(html).not.toContain('Bs.');
    expect(html).not.toContain('RIF:');
    expect(html).not.toContain('COMPROBANTE DE ENTREGA');
  });

  it('renders Venezuela delivery voucher with RIF, IVA and dual currency lines', () => {
    const veSale: LocalSale = {
      ...baseSale,
      ticketNumber: 'TKT-VE-001',
      customerDoc: 'V-12345678',
      country: 'VE',
      taxMinor: '160',
      totalMinor: '1160',
      exchangeRateBcv: '36.50',
    };

    const html = formatReceiptHtml(veSale);

    expect(html).toContain('Empresa Demo C.A.');
    expect(html).toContain('RIF: J-50123456-7');
    expect(html).toContain('COMPROBANTE DE ENTREGA');
    expect(html).toContain('IVA (16%)');
    expect(html).toContain('TOTAL BS. (TASA BCV 36.50):');
    expect(html).toContain('Bs. 423.40');
  });
});
