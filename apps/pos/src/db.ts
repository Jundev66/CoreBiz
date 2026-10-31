import Dexie, { type Table } from 'dexie';

export interface LocalProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly price: string;
  readonly trackStock: boolean;
  readonly onHand: string;
  readonly barcode?: string | null;
  readonly updatedAt?: string | null;
}

export interface ExchangeRateAudit {
  readonly rate: string;
  readonly changedAt: string;
  readonly reason?: string | null;
}

export interface LocalShift {
  readonly id: string;
  readonly registerId: string;
  readonly deviceId: string;
  readonly initialFloatMinor: string;
  readonly currency: string;
  readonly openExchangeRateBcv: string;
  readonly currentExchangeRateBcv: string;
  readonly closeExchangeRateBcv?: string | null;
  readonly rateAuditHistory?: readonly ExchangeRateAudit[];
  readonly status: 'open' | 'closed';
  readonly openedAt: string;
  readonly closedAt?: string | null;
  readonly declaredCashMinor?: string | null;
  readonly systemCashMinor?: string | null;
  readonly varianceMinor?: string | null;
  readonly notes?: string | null;
}

export interface LocalSaleLine {
  readonly id: string;
  readonly productId: string | null;
  readonly sku?: string | null;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: string;
  readonly lineTotalMinor: string;
}

export interface LocalSale {
  readonly id: string;
  readonly operationId: string;
  readonly ticketNumber: string;
  readonly invoiceControlNumber: string;
  readonly customerName: string;
  readonly customerDoc: string;
  readonly shiftId: string;
  readonly registerCode: string;
  readonly paymentMethod: 'cash' | 'card' | 'transfer' | 'split';
  readonly subtotalMinor: string;
  readonly taxMinor: string;
  readonly totalMinor: string;
  readonly exchangeRateBcv: string;
  readonly lines: readonly LocalSaleLine[];
  readonly occurredAt: string;
  readonly syncStatus: 'pending' | 'synced' | 'failed';
}

export interface OutboxItem {
  readonly id?: number;
  readonly operationId: string;
  readonly type: 'shift.open' | 'sale.issue' | 'cash.movement' | 'shift.close';
  readonly sequence: number;
  readonly payloadHash: string;
  readonly payload: Record<string, unknown>;
  readonly status: 'pending' | 'syncing' | 'synced' | 'failed';
  readonly createdAt: string;
  readonly retryCount: number;
  readonly errorMessage?: string | null;
}

export interface LocalCustomer {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly taxId: string;
  readonly phone?: string | null | undefined;
  readonly email?: string | null | undefined;
}

export interface LocalConfig {
  readonly key: string;
  readonly value: string;
}

export class CorebizPosDatabase extends Dexie {
  catalog!: Table<LocalProduct, string>;
  shifts!: Table<LocalShift, string>;
  outbox!: Table<OutboxItem, number>;
  sales!: Table<LocalSale, string>;
  customers!: Table<LocalCustomer, string>;
  config!: Table<LocalConfig, string>;

  constructor() {
    super('corebiz_pos_db');
    this.version(1).stores({
      catalog: 'id, sku, name, barcode',
      shifts: 'id, registerId, status, openedAt',
      outbox: '++id, operationId, type, sequence, status, createdAt',
      config: 'key',
    });
    this.version(2).stores({
      catalog: 'id, sku, name, barcode',
      shifts: 'id, registerId, status, openedAt',
      outbox: '++id, operationId, type, sequence, status, createdAt',
      sales: 'id, operationId, ticketNumber, occurredAt, syncStatus',
      config: 'key',
    });
    this.version(3).stores({
      catalog: 'id, sku, name, barcode',
      shifts: 'id, registerId, status, openedAt',
      outbox: '++id, operationId, type, sequence, status, createdAt',
      sales: 'id, operationId, ticketNumber, occurredAt, syncStatus',
      customers: 'id, code, name, taxId',
      config: 'key',
    });
  }
}

export const posDb = new CorebizPosDatabase();
