import { describe, expect, it } from 'vitest';
import {
  openCashShiftSchema,
  issuePosSaleSchema,
  closeCashShiftSchema,
  type PosSyncBatchInput,
} from '@corebiz/contracts';
import { DirectPosSyncQueue } from '@corebiz/application';

describe('POS Offline ATDD Queue & Zero Data Loss Acceptance Tests', () => {
  it('Scenario: Offline operations are accepted and enqueued without losing data', async () => {
    const queue = new DirectPosSyncQueue();

    const batchInput: PosSyncBatchInput = {
      deviceId: '018e245a-0000-7000-8000-000000000001',
      operations: [
        {
          operationId: '018e245a-0000-7000-8000-000000000010',
          type: 'shift.open',
          sequence: 1,
          payloadHash: '1'.repeat(64),
          payload: {
            shiftId: '018e245a-0000-7000-8000-000000000003',
            registerId: '018e245a-0000-7000-8000-000000000002',
            deviceId: '018e245a-0000-7000-8000-000000000001',
            initialFloatMinor: '2000',
            currency: 'USD',
            openedAt: new Date().toISOString(),
          },
        },
        {
          operationId: '018e245a-0000-7000-8000-000000000011',
          type: 'sale.issue',
          sequence: 2,
          payloadHash: '2'.repeat(64),
          payload: {
            saleId: '018e245a-0000-7000-8000-000000000008',
            operationId: '018e245a-0000-7000-8000-000000000011',
            registerId: '018e245a-0000-7000-8000-000000000002',
            deviceId: '018e245a-0000-7000-8000-000000000001',
            shiftId: '018e245a-0000-7000-8000-000000000003',
            ticketNumber: 'TKT-0001',
            paymentMethod: 'cash',
            lines: [
              {
                id: '018e245a-0000-7000-8000-000000000004',
                productId: '018e245a-0000-7000-8000-000000000005',
                quantity: '2',
                unitPriceMinor: '500',
              },
            ],
            occurredAt: new Date().toISOString(),
          },
        },
      ],
    };

    const parsedOpen = openCashShiftSchema.safeParse(batchInput.operations[0].payload);
    expect(parsedOpen.success).toBe(true);

    const parsedSale = issuePosSaleSchema.safeParse(batchInput.operations[1].payload);
    expect(parsedSale.success).toBe(true);

    const jobs = batchInput.operations.map((op) => ({
      tenantId: 'tenant-1',
      userId: 'user-1',
      deviceId: batchInput.deviceId,
      operation: op,
    }));

    const enqueueResult = await queue.enqueueBatch(jobs);
    expect(enqueueResult.ok).toBe(true);
    if (enqueueResult.ok) {
      expect(enqueueResult.value).toHaveLength(2);
    }
  });

  it('Scenario: Graceful degradation when queue encounters error', async () => {
    const failingQueue = new DirectPosSyncQueue(() => {
      throw new Error('Connection failed');
    });

    const res = await failingQueue.enqueue({
      tenantId: 'tenant-1',
      userId: 'user-1',
      deviceId: '018e245a-0000-7000-8000-000000000001',
      operation: {
        operationId: '018e245a-0000-7000-8000-000000000012',
        type: 'shift.close',
        sequence: 3,
        payloadHash: '3'.repeat(64),
        payload: {
          shiftId: '018e245a-0000-7000-8000-000000000003',
          declaredCashMinor: '3000',
          closedAt: new Date().toISOString(),
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('JobEnqueueFailed');
    }

    const parsedClose = closeCashShiftSchema.safeParse({
      shiftId: '018e245a-0000-7000-8000-000000000003',
      declaredCashMinor: '3000',
      closedAt: new Date().toISOString(),
    });
    expect(parsedClose.success).toBe(true);
  });
});
