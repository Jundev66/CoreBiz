import { describe, expect, it } from 'vitest';
import { BullMqPosSyncQueue } from './bullmq-pos-queue';

describe('BullMqPosSyncQueue', () => {
  it('instantiates cleanly with valid config and handles unconnectable gracefully', async () => {
    const queue = new BullMqPosSyncQueue({
      redisUrl: 'redis://127.0.0.1:63799',
    });

    const job = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      deviceId: '018e245a-0000-7000-8000-000000000001',
      operation: {
        operationId: '018e245a-0000-7000-8000-000000000002',
        type: 'shift.open',
        sequence: 1,
        payloadHash: 'c'.repeat(64),
        payload: { registerId: 'reg-1', initialCashMinor: '500' },
      },
    };

    const res = await queue.enqueue(job);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('JobEnqueueFailed');
    }

    await queue.close();
  });
});
