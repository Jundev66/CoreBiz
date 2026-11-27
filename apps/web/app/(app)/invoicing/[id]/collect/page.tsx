import { notFound } from 'next/navigation';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { readCompanyAccountMapping } from '@/api/accounting-mapping';
import { listInvoices } from '@/api/invoicing';
import { Screen } from '@/ui/shell';
import { NoAccess } from '@/ui/no-access';
import { CollectInvoiceForm } from '@/ui/collect-invoice-form';
import { filterLiquidAssetAccounts } from '@/ui/account-filters';

function formatDecimal(minorStr: string): string {
  const minor = BigInt(minorStr || '0');
  const major = minor / 100n;
  const cents = (minor % 100n).toString().padStart(2, '0');
  return `${major}.${cents}`;
}

export default async function CollectInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'invoice:write')) {
    return (
      <Screen title="Registrar Cobro" back={{ href: '/invoicing', label: 'Facturas de Venta' }}>
        <NoAccess />
      </Screen>
    );
  }

  const [invoices, accounts] = await Promise.all([
    listInvoices().catch(() => []),
    listAccounts().catch(() => []),
  ]);

  const invoice = invoices.find((inv) => inv.id === id);
  if (!invoice) {
    notFound();
  }

  const mapping = await readCompanyAccountMapping(ctx.tenantId, accounts);
  const cashAccountId = mapping.cashAccountId;
  const receivableAccountId = mapping.receivableAccountId;
  const assetAccounts = filterLiquidAssetAccounts(accounts).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  const remainingMinor = BigInt(invoice.totalMinor) - BigInt(invoice.paidMinor);
  const fiscalCurrency = ctx.settings.fiscalCountry === 'VE' ? 'VES' : 'USD';

  return (
    <Screen
      title={`Cobrar ${invoice.documentNumber}`}
      subtitle="Abono parcial o total a factura de crédito con tasa del día"
      back={{ href: '/invoicing', label: 'Facturas de Venta' }}
    >
      <CollectInvoiceForm
        invoiceId={invoice.id}
        documentNumber={invoice.documentNumber}
        currency={invoice.currency}
        totalFormatted={`${formatDecimal(invoice.totalMinor)} ${invoice.currency}`}
        paidFormatted={`${formatDecimal(invoice.paidMinor)} ${invoice.currency}`}
        remainingDecimal={formatDecimal(remainingMinor.toString())}
        cashAccountId={cashAccountId}
        receivableAccountId={receivableAccountId}
        fiscalCurrency={fiscalCurrency}
        assetAccounts={assetAccounts}
      />
    </Screen>
  );
}
