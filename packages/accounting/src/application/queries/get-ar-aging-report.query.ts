import type { Currency } from '@corebiz/shared-kernel';
import {
  computeDaysOverdue,
  determineAgingBucket,
  type AgingBucket,
  type ReceivableInvoicesPort,
} from '../../domain/port/aging-ports';

export interface GetArAgingReportQuery {
  readonly tenantId: string;
  readonly asOfDate?: Date | string | undefined;
  readonly customerId?: string | undefined;
  readonly currency?: Currency | undefined;
}

export interface AgingDocumentDto {
  readonly documentId: string;
  readonly documentNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly daysOverdue: number;
  readonly bucket: AgingBucket;
  readonly totalMinor: string;
  readonly paidMinor: string;
  readonly remainingMinor: string;
  readonly currency: Currency;
}

export interface PartnerAgingDto {
  readonly entityId: string;
  readonly entityName: string;
  readonly taxId?: string | null | undefined;
  readonly totalOpenMinor: string;
  readonly currentMinor: string;
  readonly days1To30Minor: string;
  readonly days31To60Minor: string;
  readonly days61To90Minor: string;
  readonly days90PlusMinor: string;
  readonly currency: Currency;
  readonly documents: readonly AgingDocumentDto[];
}

export interface ArAgingReportResult {
  readonly direction: 'RECEIVABLE';
  readonly asOfDate: string;
  readonly currency: Currency;
  readonly totalOpenMinor: string;
  readonly totalCurrentMinor: string;
  readonly totalDays1To30Minor: string;
  readonly totalDays31To60Minor: string;
  readonly totalDays61To90Minor: string;
  readonly totalDays90PlusMinor: string;
  readonly partners: readonly PartnerAgingDto[];
}

export class GetArAgingReportQueryHandler {
  constructor(private readonly receivableInvoicesPort: ReceivableInvoicesPort) {}

  async execute(query: GetArAgingReportQuery): Promise<ArAgingReportResult> {
    const asOfDate =
      typeof query.asOfDate === 'string'
        ? new Date(query.asOfDate)
        : (query.asOfDate ?? new Date());

    const currency: Currency = query.currency ?? 'USD';

    const openInvoices = await this.receivableInvoicesPort.listOpenInvoices(
      query.tenantId,
      query.customerId,
    );

    const partnerMap = new Map<
      string,
      {
        entityId: string;
        entityName: string;
        taxId?: string | null | undefined;
        totalOpen: bigint;
        current: bigint;
        days1To30: bigint;
        days31To60: bigint;
        days61To90: bigint;
        days90Plus: bigint;
        documents: AgingDocumentDto[];
      }
    >();

    for (const inv of openInvoices) {
      if (inv.remainingBalance.isZero || inv.status === 'VOID') {
        continue;
      }

      const daysOverdue = computeDaysOverdue(asOfDate, inv.dueDate);
      const bucket = determineAgingBucket(daysOverdue);
      const remaining = inv.remainingBalance.minorUnits;

      let partner = partnerMap.get(inv.customerId);
      if (!partner) {
        partner = {
          entityId: inv.customerId,
          entityName: inv.customerName ?? `Customer ${inv.customerId}`,
          taxId: inv.taxId ?? null,
          totalOpen: 0n,
          current: 0n,
          days1To30: 0n,
          days31To60: 0n,
          days61To90: 0n,
          days90Plus: 0n,
          documents: [],
        };
        partnerMap.set(inv.customerId, partner);
      }

      partner.totalOpen += remaining;
      switch (bucket) {
        case 'CURRENT':
          partner.current += remaining;
          break;
        case 'DAYS_1_30':
          partner.days1To30 += remaining;
          break;
        case 'DAYS_31_60':
          partner.days31To60 += remaining;
          break;
        case 'DAYS_61_90':
          partner.days61To90 += remaining;
          break;
        case 'DAYS_90_PLUS':
          partner.days90Plus += remaining;
          break;
      }

      partner.documents.push({
        documentId: inv.id,
        documentNumber: inv.documentNumber,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        daysOverdue,
        bucket,
        totalMinor: inv.total.minorUnits.toString(),
        paidMinor: inv.paidAmount.minorUnits.toString(),
        remainingMinor: inv.remainingBalance.minorUnits.toString(),
        currency,
      });
    }

    let grandTotalOpen = 0n;
    let grandTotalCurrent = 0n;
    let grandTotal1To30 = 0n;
    let grandTotal31To60 = 0n;
    let grandTotal61To90 = 0n;
    let grandTotal90Plus = 0n;

    const partnerSummaries: PartnerAgingDto[] = [];
    for (const p of partnerMap.values()) {
      grandTotalOpen += p.totalOpen;
      grandTotalCurrent += p.current;
      grandTotal1To30 += p.days1To30;
      grandTotal31To60 += p.days31To60;
      grandTotal61To90 += p.days61To90;
      grandTotal90Plus += p.days90Plus;

      partnerSummaries.push({
        entityId: p.entityId,
        entityName: p.entityName,
        taxId: p.taxId,
        totalOpenMinor: p.totalOpen.toString(),
        currentMinor: p.current.toString(),
        days1To30Minor: p.days1To30.toString(),
        days31To60Minor: p.days31To60.toString(),
        days61To90Minor: p.days61To90.toString(),
        days90PlusMinor: p.days90Plus.toString(),
        currency,
        documents: p.documents,
      });
    }

    partnerSummaries.sort((a, b) => (BigInt(b.totalOpenMinor) > BigInt(a.totalOpenMinor) ? 1 : -1));

    return {
      direction: 'RECEIVABLE',
      asOfDate: asOfDate.toISOString(),
      currency,
      totalOpenMinor: grandTotalOpen.toString(),
      totalCurrentMinor: grandTotalCurrent.toString(),
      totalDays1To30Minor: grandTotal1To30.toString(),
      totalDays31To60Minor: grandTotal31To60.toString(),
      totalDays61To90Minor: grandTotal61To90.toString(),
      totalDays90PlusMinor: grandTotal90Plus.toString(),
      partners: partnerSummaries,
    };
  }
}
