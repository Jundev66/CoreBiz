import { posDb, type OutboxItem, type LocalProduct, type LocalCustomer } from './db';

export async function computePayloadHash(payload: unknown): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function queueOutboxOperation(
  operationId: string,
  type: OutboxItem['type'],
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  const payloadHash = await computePayloadHash(payload);
  const lastOp = await posDb.outbox.orderBy('sequence').last();
  const nextSeq = lastOp ? lastOp.sequence + 1 : 1;

  const item: OutboxItem = {
    operationId,
    type,
    sequence: nextSeq,
    payloadHash,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  const id = await posDb.outbox.add(item);
  return { ...item, id };
}

export interface SyncResult {
  readonly syncedCount: number;
  readonly failedCount: number;
  readonly errors: readonly string[];
}

export async function syncOutbox(
  apiBaseUrl: string,
  token: string,
  deviceId: string,
): Promise<SyncResult> {
  const pendingItems = await posDb.outbox
    .where('status')
    .anyOf(['pending', 'failed'])
    .sortBy('sequence');

  if (pendingItems.length === 0) {
    return { syncedCount: 0, failedCount: 0, errors: [] };
  }

  const batchPayload = {
    deviceId,
    operations: pendingItems.map((item) => ({
      operationId: item.operationId,
      type: item.type,
      sequence: item.sequence,
      payloadHash: item.payloadHash,
      payload: item.payload,
    })),
  };

  try {
    const res = await fetch(`${apiBaseUrl}/v1/pos/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batchPayload),
    });

    if (!res.ok) {
      throw new Error(`Sync HTTP error: ${res.status}`);
    }

    const data = (await res.json()) as {
      results: Array<{
        operationId: string;
        status: 'processed' | 'duplicate' | 'failed' | 'enqueued';
        error?: string;
        conflictId?: string;
      }>;
    };

    let syncedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const result of data.results) {
      const match = pendingItems.find((p) => p.operationId === result.operationId);
      if (!match || match.id === undefined) continue;

      if (
        result.status === 'processed' ||
        result.status === 'duplicate' ||
        result.status === 'enqueued'
      ) {
        await posDb.outbox.update(match.id, {
          status: 'synced',
          errorMessage: null,
        });
        const localSale = await posDb.sales.where('operationId').equals(result.operationId).first();
        if (localSale) {
          await posDb.sales.update(localSale.id, { syncStatus: 'synced' });
        }
        syncedCount++;
      } else {
        await posDb.outbox.update(match.id, {
          status: 'failed',
          retryCount: match.retryCount + 1,
          errorMessage: result.error ?? 'Unknown error',
        });
        const localSale = await posDb.sales.where('operationId').equals(result.operationId).first();
        if (localSale) {
          await posDb.sales.update(localSale.id, { syncStatus: 'failed' });
        }
        failedCount++;
        if (result.error) errors.push(result.error);
      }
    }

    return { syncedCount, failedCount, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Network sync error';
    return { syncedCount: 0, failedCount: pendingItems.length, errors: [msg] };
  }
}

export async function syncCatalog(
  apiBaseUrl: string,
  token: string,
): Promise<{ updatedCount: number }> {
  const lastSyncEntry = await posDb.config.get('last_catalog_sync_at');
  const sinceQuery = lastSyncEntry?.value
    ? `?since=${encodeURIComponent(lastSyncEntry.value)}&limit=500`
    : '?limit=500';

  const res = await fetch(`${apiBaseUrl}/v1/pos/catalog${sinceQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Catalog sync error: ${res.status}`);
  }

  const data = (await res.json()) as {
    items: Array<{
      id: string;
      sku: string;
      name: string;
      unit: string;
      price: string;
      trackStock: boolean;
      onHand: string;
      barcode?: string | null;
      updatedAt?: string;
    }>;
    serverTime: string;
  };

  const localItems: LocalProduct[] = data.items.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    price: p.price,
    trackStock: p.trackStock,
    onHand: p.onHand,
    barcode: p.barcode ?? null,
    updatedAt: p.updatedAt ?? null,
  }));

  if (localItems.length > 0) {
    await posDb.catalog.bulkPut(localItems);
  }

  await posDb.config.put({
    key: 'last_catalog_sync_at',
    value: data.serverTime,
  });

  return { updatedCount: localItems.length };
}

export async function syncCustomersFromErp(apiBaseUrl = ''): Promise<number> {
  try {
    const res = await fetch(`${apiBaseUrl}/v1/pos/demo-customers`);
    if (res.ok) {
      const data = (await res.json()) as { items: LocalCustomer[] };
      if (data.items && data.items.length > 0) {
        await posDb.customers.bulkPut(data.items);
        return data.items.length;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export function registerOnlineSyncListener(onReconnect: () => void): () => void {
  function handleOnline(): void {
    onReconnect();
  }

  window.addEventListener('online', handleOnline);
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
