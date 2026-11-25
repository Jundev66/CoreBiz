import Link from 'next/link';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import {
  readAccountingConfigStatus,
  readCompanyAccountMapping,
  readProductTaxMap,
} from '@/api/accounting-mapping';
import { listInvoices } from '@/api/invoicing';
import { listTaxRateConfigs } from '@/api/fiscal';
import { Screen } from '@/ui/shell';
import { Alert } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { InvoiceForm } from '@/ui/invoice-form';

export default async function NewInvoicePage() {
  const { ctx, queries } = await apiForRequest();

  if (!can(ctx.actor, 'invoice:write')) {
    return (
      <Screen
        title="Nueva Factura de Venta"
        back={{ href: '/invoicing', label: 'Facturas de Venta' }}
      >
        <NoAccess />
      </Screen>
    );
  }

  const [customers, products, accounts, existingInvoices, taxRates, productTaxMap] =
    await Promise.all([
      queries.customers.options(),
      queries.products.options(),
      listAccounts().catch(() => []),
      listInvoices().catch(() => []),
      listTaxRateConfigs().catch(() => []),
      readProductTaxMap(ctx.tenantId),
    ]);

  const [mapping, accountingStatus] = await Promise.all([
    readCompanyAccountMapping(ctx.tenantId, accounts),
    readAccountingConfigStatus(ctx.tenantId, accounts, [
      'cashAccountId',
      'receivableAccountId',
      'revenueAccountId',
      'taxPayableAccountId',
    ]),
  ]);
  const accountDefaults = {
    receivableAccountId: mapping.receivableAccountId,
    revenueAccountId: mapping.revenueAccountId,
    taxPayableAccountId: mapping.taxPayableAccountId,
    cashAccountId: mapping.cashAccountId,
  };

  const nextNum = String(existingInvoices.length + 1).padStart(6, '0');

  const defaultTax = taxRates.find((r) => r.isDefault) ?? taxRates[0];
  const defaultTaxPercentage = defaultTax ? defaultTax.rateBp / 100 : ctx.settings.taxRateBp / 100;

  return (
    <Screen
      title="Nueva Factura de Venta"
      subtitle="Emisión comercial con asiento contable automático en Libro Diario"
      back={{ href: '/invoicing', label: 'Facturas de Venta' }}
    >
      {!accountingStatus.isConfigured && (
        <Alert tone="warn" role="alert" className="mb-6">
          Faltan cuentas contables configuradas para emitir facturas de venta (
          {accountingStatus.missingRoles.join(', ')}).{' '}
          <Link href="/settings/accounting" className="font-semibold underline">
            Configurar Cuentas Contables
          </Link>
        </Alert>
      )}
      <InvoiceForm
        customers={customers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.sku} · ${p.name}`,
          name: p.name,
          price: p.price,
          taxPercentage: productTaxMap[p.id] ?? null,
        }))}
        defaultDocumentNumber={`FAC-${nextNum}`}
        defaultCurrency={ctx.settings.baseCurrency}
        defaultTaxPercentage={defaultTaxPercentage}
        taxRates={taxRates.map((r) => ({
          id: r.id,
          label: r.name,
          percentage: String(r.rateBp / 100),
        }))}
        accounts={accountDefaults}
        accountingConfigured={accountingStatus.isConfigured}
      />
    </Screen>
  );
}
