import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { listInvoices } from '@/api/invoicing';
import { listTaxRateConfigs } from '@/api/fiscal';
import { Screen } from '@/ui/shell';
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

  const [customers, products, accounts, existingInvoices, taxRates] = await Promise.all([
    queries.customers.options(),
    queries.products.options(),
    listAccounts().catch(() => []),
    listInvoices().catch(() => []),
    listTaxRateConfigs().catch(() => []),
  ]);

  const findAccount = (codes: string[], fallbackCategory: string, fallbackId: string) =>
    accounts.find((a) => codes.includes(a.code))?.id ??
    accounts.find((a) => a.category === fallbackCategory)?.id ??
    fallbackId;

  const accountDefaults = {
    receivableAccountId: findAccount(['1.1.02', '1200'], 'ASSET', 'tpl-1.1.02'),
    revenueAccountId: findAccount(['4.1.01', '4010'], 'REVENUE', 'tpl-4.1.01'),
    taxPayableAccountId: findAccount(['2.1.02', '2050'], 'LIABILITY', 'tpl-2.1.02'),
    cashAccountId: findAccount(['1.1.01', '1010'], 'ASSET', 'tpl-1.1.01'),
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
      <InvoiceForm
        customers={customers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.sku} · ${p.name}`,
          name: p.name,
          price: p.price,
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
      />
    </Screen>
  );
}
