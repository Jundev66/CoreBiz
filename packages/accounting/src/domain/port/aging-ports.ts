import type { Money } from '@corebiz/shared-kernel';

export type AgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';

export type AgingDirection = 'RECEIVABLE' | 'PAYABLE';

export interface ReceivableInvoiceItem {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly customerName?: string | undefined;
  readonly taxId?: string | undefined;
  readonly documentNumber: string;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly total: Money;
  readonly paidAmount: Money;
  readonly remainingBalance: Money;
  readonly status: string;
}

export interface ReceivableInvoicesPort {
  listOpenInvoices(
    tenantId: string,
    customerId?: string,
  ): Promise<readonly ReceivableInvoiceItem[]>;
}

export interface PayableBillItem {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly taxId?: string | undefined;
  readonly billNumber: string;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly total: Money;
  readonly paidAmount: Money;
  readonly remainingBalance: Money;
  readonly status: string;
}

export interface PayableBillsPort {
  listOpenBills(tenantId: string, supplierId?: string): Promise<readonly PayableBillItem[]>;
}

export function normalizeToDateOnly(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeDaysOverdue(asOfDate: Date, dueDate: Date): number {
  const asOfMs = normalizeToDateOnly(asOfDate);
  const dueMs = normalizeToDateOnly(dueDate);
  return Math.floor((asOfMs - dueMs) / (1000 * 60 * 60 * 24));
}

export function determineAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'DAYS_1_30';
  if (daysOverdue <= 60) return 'DAYS_31_60';
  if (daysOverdue <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}
