import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';
import { BullMqPosSyncQueue } from '@corebiz/infrastructure';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  resetEnv();

  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe('Full End-to-End QA Testing: POS Offline-First & Queue Lifecycle', () => {
  let deviceId: string;
  let registerId: string;
  let shiftId: string;
  const installationId = '018e245a-0000-7000-8000-000000000001';

  it('Stage 1 [QA]: Enroll device against seeded demo register CAJA-01', async () => {
    const res = await fetch(`${baseUrl}/v1/pos/devices/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installationId,
        name: 'Terminal Mostrador Principal',
        platform: 'Android 14',
        browser: 'Chrome PWA',
        pairingCode: 'CAJA-01',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      deviceId: string;
      registerId: string;
      registerCode: string;
      deviceToken: string;
    };

    expect(body.deviceId).toBeDefined();
    expect(body.registerId).toBeDefined();
    expect(body.registerCode).toBe('CAJA-01');
    expect(body.deviceToken).toBeDefined();

    deviceId = body.deviceId;
    registerId = body.registerId;
    shiftId = '018e245a-0000-7000-8000-000000000030';
  });

  it('Stage 2 [QA]: Sync batch with Shift Open, Cash Movements, and Sales', async () => {
    const openPayload = {
      shiftId,
      registerId,
      deviceId,
      initialFloatMinor: '5000',
      currency: 'USD',
      openedAt: new Date().toISOString(),
    };

    const cashInPayload = {
      movementId: '018e245a-0000-7000-8000-000000000031',
      shiftId,
      type: 'cash_in',
      amountMinor: '2000',
      reason: 'Fondo de cambio sencillo',
      occurredAt: new Date().toISOString(),
    };

    const salePayload = {
      saleId: '018e245a-0000-7000-8000-000000000032',
      operationId: '018e245a-0000-7000-8000-000000000022',
      registerId,
      deviceId,
      shiftId,
      ticketNumber: 'TKT-QA-0001',
      paymentMethod: 'cash',
      lines: [
        {
          id: '018e245a-0000-7000-8000-000000000033',
          productId: null,
          temporaryName: 'Venta Contingente Varios',
          quantity: '1',
          unitPriceMinor: '1500',
        },
      ],
      occurredAt: new Date().toISOString(),
    };

    const batch = {
      deviceId,
      operations: [
        {
          operationId: '018e245a-0000-7000-8000-000000000020',
          type: 'shift.open',
          sequence: 1,
          payloadHash: 'a'.repeat(64),
          payload: openPayload,
        },
        {
          operationId: '018e245a-0000-7000-8000-000000000021',
          type: 'cash.movement',
          sequence: 2,
          payloadHash: 'b'.repeat(64),
          payload: cashInPayload,
        },
        {
          operationId: '018e245a-0000-7000-8000-000000000022',
          type: 'sale.issue',
          sequence: 3,
          payloadHash: 'c'.repeat(64),
          payload: salePayload,
        },
      ],
    };

    const res = await fetch(`${baseUrl}/v1/pos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      results: Array<{ operationId: string; status: string }>;
    };

    expect(body.results).toHaveLength(3);
    for (const r of body.results) {
      expect(['processed', 'enqueued']).toContain(r.status);
    }
  });

  it('Stage 3 [QA]: Idempotency check - replay exact same batch and verify zero side-effects', async () => {
    const replayBatch = {
      deviceId,
      operations: [
        {
          operationId: '018e245a-0000-7000-8000-000000000022',
          type: 'sale.issue',
          sequence: 3,
          payloadHash: 'c'.repeat(64),
          payload: {
            saleId: '018e245a-0000-7000-8000-000000000032',
            operationId: '018e245a-0000-7000-8000-000000000022',
            registerId,
            deviceId,
            shiftId,
            ticketNumber: 'TKT-QA-0001',
            paymentMethod: 'cash',
            lines: [
              {
                id: '018e245a-0000-7000-8000-000000000033',
                productId: null,
                temporaryName: 'Venta Contingente Varios',
                quantity: '1',
                unitPriceMinor: '1500',
              },
            ],
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    };

    const res = await fetch(`${baseUrl}/v1/pos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replayBatch),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      results: Array<{ operationId: string; status: string }>;
    };
    expect(body.results[0]?.status).toBe('duplicate');
  });

  it('Stage 4 [QA]: Inventory negative stock conflict creation and resolution', async () => {
    const catalogRes = await fetch(`${baseUrl}/v1/pos/catalog?limit=5`);
    const catalog = (await catalogRes.json()) as {
      items: Array<{ id: string; onHand: string }>;
    };
    expect(catalog.items.length).toBeGreaterThan(0);

    const product = catalog.items[0];
    expect(product).toBeDefined();

    if (product) {
      const overSalePayload = {
        saleId: '018e245a-0000-7000-8000-000000000035',
        operationId: '018e245a-0000-7000-8000-000000000025',
        registerId,
        deviceId,
        shiftId,
        ticketNumber: 'TKT-QA-0002',
        paymentMethod: 'cash',
        lines: [
          {
            id: '018e245a-0000-7000-8000-000000000036',
            productId: product.id,
            quantity: '999999',
            unitPriceMinor: '1000',
          },
        ],
        occurredAt: new Date().toISOString(),
      };

      const res = await fetch(`${baseUrl}/v1/pos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          operations: [
            {
              operationId: '018e245a-0000-7000-8000-000000000025',
              type: 'sale.issue',
              sequence: 4,
              payloadHash: 'd'.repeat(64),
              payload: overSalePayload,
            },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const syncBody = (await res.json()) as {
        results: Array<{
          operationId: string;
          status: string;
          conflictId?: string;
        }>;
      };

      const oversellResult = syncBody.results[0];
      expect(oversellResult?.status).toBe('processed');
      expect(oversellResult?.conflictId).toBeDefined();

      if (oversellResult?.conflictId) {
        const resolveRes = await fetch(
          `${baseUrl}/v1/pos/conflicts/${oversellResult.conflictId}/resolve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resolutionType: 'dismissed_known',
              notes: 'Aceptado por inventario físico en auditoría QA',
            }),
          },
        );
        expect(resolveRes.status).toBe(201);
      }
    }
  });

  it('Stage 5 [QA]: Blind cash shift close with discrepancy calculation', async () => {
    const closeRes = await fetch(`${baseUrl}/v1/pos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        operations: [
          {
            operationId: '018e245a-0000-7000-8000-000000000029',
            type: 'shift.close',
            sequence: 5,
            payloadHash: 'e'.repeat(64),
            payload: {
              shiftId,
              declaredCashMinor: '8500',
              notes: 'Arqueo ciego QA completado sin faltante',
              closedAt: new Date().toISOString(),
            },
          },
        ],
      }),
    });

    expect(closeRes.status).toBe(201);
    const body = (await closeRes.json()) as {
      results: Array<{ operationId: string; status: string }>;
    };
    expect(body.results[0]?.status).toBe('processed');
  });

  it('Stage 6 [QA]: Real BullMQ + Docker Redis queue connection and job processing', async () => {
    const bullQueue = new BullMqPosSyncQueue({
      redisUrl: 'redis://127.0.0.1:6379',
      queueName: 'qa-pos-sync-test-queue',
    });

    const qaJob = {
      tenantId: '00000000-0000-0000-0000-0000000000t1',
      userId: '00000000-0000-0000-0000-000000000001',
      deviceId,
      operation: {
        operationId: '018e245a-0000-7000-8000-000000000099',
        type: 'shift.open',
        sequence: 10,
        payloadHash: 'f'.repeat(64),
        payload: {
          shiftId: '018e245a-0000-7000-8000-000000000098',
          registerId,
          deviceId,
          initialFloatMinor: '3000',
          currency: 'USD',
          openedAt: new Date().toISOString(),
        },
      },
    };

    const enqueueRes = await bullQueue.enqueue(qaJob);
    expect(enqueueRes.ok).toBe(true);
    if (enqueueRes.ok) {
      expect(enqueueRes.value.jobId).toBe(qaJob.operation.operationId);
    }

    await bullQueue.close();
  });
});
