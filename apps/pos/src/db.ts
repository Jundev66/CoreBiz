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

export interface LocalShift {
  readonly id: string;
  readonly registerId: string;
  readonly deviceId: string;
  readonly initialFloatMinor: string;
  readonly currency: string;
  readonly status: 'open' | 'closed';
  readonly openedAt: string;
  readonly closedAt?: string | null;
  readonly declaredCashMinor?: string | null;
  readonly systemCashMinor?: string | null;
  readonly varianceMinor?: string | null;
  readonly notes?: string | null;
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

export interface LocalConfig {
  readonly key: string;
  readonly value: string;
}

export class CorebizPosDatabase extends Dexie {
  catalog!: Table<LocalProduct, string>;
  shifts!: Table<LocalShift, string>;
  outbox!: Table<OutboxItem, number>;
  config!: Table<LocalConfig, string>;

  constructor() {
    super('corebiz_pos_db');
    this.version(1).stores({
      catalog: 'id, sku, name, barcode',
      shifts: 'id, registerId, status, openedAt',
      outbox: '++id, operationId, type, sequence, status, createdAt',
      config: 'key',
    });
  }
}

export const posDb = new CorebizPosDatabase();
