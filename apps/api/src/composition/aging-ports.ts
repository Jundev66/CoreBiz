import { Money } from '@corebiz/shared-kernel';
import type {
  PayableBillItem,
  PayableBillsPort,
  ReceivableInvoiceItem,
  ReceivableInvoicesPort,
} from '@corebiz/accounting';
import type { TenantContext } from '@corebiz/application';
import type { Runtime } from './runtime.provider';

export function makeAgingPorts(
  runtime: Runtime,
  ctx: TenantContext,
): {
  readonly receivableInvoices: ReceivableInvoicesPort;
  readonly payableBills: PayableBillsPort;
} {
  const receivableInvoices: ReceivableInvoicesPort = {
    async listOpenInvoices(
      tenantId: string,
      customerId?: string,
    ): Promise<readonly ReceivableInvoiceItem[]> {
      const [invoices, customersPage] = await Promise.all([
        customerId
          ? runtime.invoices.listByCustomer(tenantId, customerId)
          : runtime.invoices.listByTenant(tenantId),
        runtime.queries.customers
          .list({ includeArchived: true, limit: 200 })
          .catch(() => ({ items: [] })),
      ]);

      const customerById = new Map(customersPage.items.map((c) => [c.id, c]));

      return invoices
        .filter((inv) => inv.status !== 'VOID' && inv.remainingBalance.minorUnits > 0n)
        .map((inv) => {
          const customer = customerById.get(inv.customerId);
          return {
            id: inv.id,
            tenantId: inv.tenantId,
            customerId: inv.customerId,
            customerName: customer?.name ?? inv.customerId,
            taxId: customer?.taxId ?? undefined,
            documentNumber: inv.documentNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            total: inv.total,
            paidAmount: inv.paidAmount,
            remainingBalance: inv.remainingBalance,
            status: inv.status,
          };
        });
    },
  };

  const payableBills: PayableBillsPort = {
    async listOpenBills(
      tenantId: string,
      supplierId?: string,
    ): Promise<readonly PayableBillItem[]> {
      const [receiptsPage, suppliersPage, accounts, entries] = await Promise.all([
        runtime.queries.purchasing.receipts({ limit: 200 }).catch(() => ({ items: [] })),
        runtime.queries.purchasing
          .suppliers({ includeArchived: true, limit: 200 })
          .catch(() => ({ items: [] })),
        runtime.accounts.listByTenant(tenantId).catch(() => []),
        runtime.journalEntries
          .listByDateRange(tenantId, new Date(0), new Date(Date.now() + 365 * 86_400_000))
          .catch(() => []),
      ]);

      const supplierByCode = new Map(suppliersPage.items.map((s) => [s.code, s]));
      const payableAccountIds = new Set(
        accounts
          .filter(
            (a) =>
              a.code.value === '2.1.01' || a.code.value === '2010' || a.category === 'LIABILITY',
          )
          .map((a) => a.id),
      );

      const result: PayableBillItem[] = [];
      for (const receipt of receiptsPage.items) {
        if (receipt.status === 'voided') continue;

        const detail = await runtime.queries.purchasing.receiptById(receipt.id).catch(() => null);
        if (!detail) continue;

        const supplier = supplierByCode.get(detail.supplierCode);
        if (supplierId && supplier?.id !== supplierId) continue;

        const receiptEntries = entries.filter((e) => e.sourceId === detail.id);
        const purchaseEntry = receiptEntries.find((e) => e.sourceType === 'PURCHASE');
        if (!purchaseEntry) continue;

        const isCredit = purchaseEntry.lines.some(
          (l) => payableAccountIds.has(l.accountId) && l.credit.minorUnits > 0n,
        );
        if (!isCredit) continue;

        const currency = purchaseEntry.lines[0]?.debit.currency ?? ctx.settings.baseCurrency;
        const totalMinor = BigInt(purchaseEntry.totalCredit);
        const paidMinor = receiptEntries
          .filter((e) => e.sourceType === 'PAYMENT')
          .reduce<bigint>((acc, e) => acc + BigInt(e.totalDebit), 0n);
        const remainingMinor = totalMinor > paidMinor ? totalMinor - paidMinor : 0n;
        if (remainingMinor <= 0n) continue;

        const issueDate = detail.receivedAt ?? new Date();
        const dueDate = new Date(issueDate.getTime() + 30 * 86_400_000);

        result.push({
          id: detail.id,
          tenantId,
          supplierId: supplier?.id ?? detail.supplierCode,
          supplierName: detail.supplierName,
          taxId: supplier?.taxId ?? undefined,
          billNumber: detail.supplierReference || detail.number,
          issueDate,
          dueDate,
          total: Money.fromMinor(totalMinor, currency),
          paidAmount: Money.fromMinor(paidMinor, currency),
          remainingBalance: Money.fromMinor(remainingMinor, currency),
          status: paidMinor > 0n ? 'PARTIALLY_PAID' : 'ISSUED',
        });
      }

      return result;
    },
  };

  return { receivableInvoices, payableBills };
}
