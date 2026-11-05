import { posDb, type OutboxItem, type LocalProduct, type LocalCustomer } from './db';
import { DEMO_DEVICE_TOKEN } from './demo-seed';

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
  const lastSeq = lastOp ? lastOp.sequence : 0;
  const now = Date.now();
  const nextSeq = now > lastSeq ? now : lastSeq + 1;

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
  const regConfig = await posDb.config.get('register_id');
  if (!regConfig || regConfig.value === 'reg-default') {
    await posDb.config.put({ key: 'register_id', value: '00000000-0000-0000-0000-000000000099' });
  }
  const devConfig = await posDb.config.get('device_id');
  if (!devConfig || devConfig.value === 'dev-default') {
    await posDb.config.put({ key: 'device_id', value: '018e245a-0000-7000-8000-000000000001' });
  }

  const syncedOutbox = await posDb.outbox.where('status').equals('synced').toArray();
  for (const item of syncedOutbox) {
    let sale = await posDb.sales.where('operationId').equals(item.operationId).first();
    if (!sale && item.payload && typeof item.payload.saleId === 'string') {
      sale = await posDb.sales.get(item.payload.saleId);
    }
    if (sale && sale.syncStatus !== 'synced') {
      await posDb.sales.update(sale.id, { syncStatus: 'synced' });
    }
  }

  const storedReg = await posDb.config.get('register_id');
  const storedDev = await posDb.config.get('device_id');
  const activeRegId = storedReg?.value || '00000000-0000-0000-0000-000000000099';
  const activeDevId = storedDev?.value || '018e245a-0000-7000-8000-000000000001';

  const unsyncedSales = await posDb.sales.where('syncStatus').notEqual('synced').toArray();
  for (const s of unsyncedSales) {
    const existingOp = await posDb.outbox.where('operationId').equals(s.operationId).first();
    if (!existingOp) {
      const outboxLines = s.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        temporaryName: l.productId ? null : l.name,
        barcodeScanned: null,
        quantity: l.quantity.toString(),
        unitPriceMinor: l.unitPriceMinor,
      }));
      await queueOutboxOperation(s.operationId, 'sale.issue', {
        saleId: s.id,
        operationId: s.operationId,
        registerId: activeRegId,
        deviceId: activeDevId,
        shiftId: s.shiftId,
        ticketNumber: s.ticketNumber,
        receiptSequenceNumber: s.receiptSequenceNumber,
        customerName: s.customerName,
        customerDoc: s.customerDoc,
        paymentMethod: s.paymentMethod,
        lines: outboxLines,
        occurredAt: s.occurredAt,
      });
    }
  }

  const pendingItems = await posDb.outbox
    .where('status')
    .anyOf(['pending', 'failed'])
    .sortBy('sequence');

  if (pendingItems.length === 0) {
    return { syncedCount: 0, failedCount: 0, errors: [] };
  }

  const CHUNK_SIZE = 10;
  let totalSynced = 0;
  let totalFailed = 0;
  const allErrors: string[] = [];

  const cleanDeviceId =
    typeof deviceId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)
      ? deviceId
      : '018e245a-0000-7000-8000-000000000001';

  for (let offset = 0; offset < pendingItems.length; offset += CHUNK_SIZE) {
    const chunk = pendingItems.slice(offset, offset + CHUNK_SIZE);
    const now = Date.now();
    const operations = await Promise.all(
      chunk.map(async (item, idx) => {
        const raw = item.payload ?? {};
        let paymentMethod = raw.paymentMethod;
        if (paymentMethod === 'cash_usd' || paymentMethod === 'cash_ves') {
          paymentMethod = 'cash';
        } else if (paymentMethod === 'pago_movil') {
          paymentMethod = 'transfer';
        } else if (paymentMethod === 'punto_debito' || paymentMethod === 'biopago') {
          paymentMethod = 'card';
        }

        const lines = Array.isArray(raw.lines)
          ? raw.lines.map((l: Record<string, unknown>) => ({
              ...l,
              quantity: typeof l.quantity === 'number' ? l.quantity.toString() : l.quantity,
              unitPriceMinor:
                typeof l.unitPriceMinor === 'number' || typeof l.unitPriceMinor === 'bigint'
                  ? l.unitPriceMinor.toString()
                  : l.unitPriceMinor,
            }))
          : raw.lines;

        const storedRegEntry = await posDb.config.get('register_id');
        const storedDevEntry = await posDb.config.get('device_id');
        const configuredRegisterId = storedRegEntry?.value;
        const configuredDeviceId = storedDevEntry?.value;

        const rawRegisterId = raw.registerId;
        const isDemoRegister =
          !rawRegisterId || rawRegisterId === '00000000-0000-0000-0000-000000000099';
        const validRegisterId =
          isDemoRegister &&
          configuredRegisterId &&
          configuredRegisterId !== '00000000-0000-0000-0000-000000000099'
            ? configuredRegisterId
            : typeof rawRegisterId === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  rawRegisterId,
                )
              ? rawRegisterId
              : configuredRegisterId || '00000000-0000-0000-0000-000000000099';

        const rawDeviceId = raw.deviceId;
        const isDemoDevice = !rawDeviceId || rawDeviceId === '018e245a-0000-7000-8000-000000000001';
        const validDeviceId =
          isDemoDevice &&
          configuredDeviceId &&
          configuredDeviceId !== '018e245a-0000-7000-8000-000000000001'
            ? configuredDeviceId
            : typeof rawDeviceId === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawDeviceId)
              ? rawDeviceId
              : configuredDeviceId || deviceId || '018e245a-0000-7000-8000-000000000001';

        const normalizedPayload = {
          ...raw,
          registerId: validRegisterId,
          deviceId: validDeviceId,
          paymentMethod,
          lines,
        };

        const computedHash = await computePayloadHash(normalizedPayload);

        return {
          operationId: item.operationId,
          type: item.type,
          sequence: item.sequence < 1000 ? now + idx : item.sequence,
          payloadHash: computedHash,
          payload: normalizedPayload,
        };
      }),
    );

    const batchPayload = {
      deviceId: cleanDeviceId,
      operations,
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
        const errText = await res.text();
        console.error('POS Sync HTTP error:', res.status, errText);
        throw new Error(`Sync HTTP error: ${res.status} - ${errText}`);
      }

      const data = (await res.json()) as {
        results: Array<{
          operationId: string;
          status: 'processed' | 'duplicate' | 'failed' | 'enqueued';
          error?: string;
          conflictId?: string;
        }>;
      };

      for (const result of data.results) {
        const match = chunk.find((p) => p.operationId === result.operationId);
        if (!match || match.id === undefined) continue;

        let localSale = await posDb.sales.where('operationId').equals(result.operationId).first();
        if (!localSale && match.payload && typeof match.payload.saleId === 'string') {
          localSale = await posDb.sales.get(match.payload.saleId);
        }
        if (!localSale) {
          const allSales = await posDb.sales.toArray();
          localSale = allSales.find(
            (s) => s.operationId === result.operationId || s.id === match.payload?.saleId,
          );
        }

        if (
          result.status === 'processed' ||
          result.status === 'duplicate' ||
          result.status === 'enqueued'
        ) {
          await posDb.outbox.update(match.id, {
            status: 'synced',
            errorMessage: null,
          });
          if (localSale) {
            await posDb.sales.update(localSale.id, { syncStatus: 'synced' });
          }
          totalSynced++;
        } else {
          await posDb.outbox.update(match.id, {
            status: 'failed',
            retryCount: match.retryCount + 1,
            errorMessage: result.error ?? 'Unknown error',
          });
          if (localSale) {
            await posDb.sales.update(localSale.id, { syncStatus: 'failed' });
          }
          totalFailed++;
          if (result.error) allErrors.push(result.error);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Network sync error';
      allErrors.push(msg);
      totalFailed += chunk.length;
      break;
    }
  }

  return { syncedCount: totalSynced, failedCount: totalFailed, errors: allErrors };
}

export async function syncCatalog(
  apiBaseUrl = '',
  token?: string,
): Promise<{ updatedCount: number }> {
  const effectiveToken =
    token || (await posDb.config.get('device_token'))?.value || DEMO_DEVICE_TOKEN;
  const lastSyncEntry = await posDb.config.get('last_catalog_sync_at');
  const sinceQuery = lastSyncEntry?.value
    ? `?since=${encodeURIComponent(lastSyncEntry.value)}&limit=500`
    : '?limit=500';

  const res = await fetch(`${apiBaseUrl}/v1/pos/catalog${sinceQuery}`, {
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
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
