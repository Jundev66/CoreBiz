import { describe, expect, it } from 'vitest';
import { DirectPosSyncQueue } from './direct-pos-queue';
import { ok } from '@corebiz/domain';

describe('DirectPosSyncQueue', () => {
  it('enqueues jobs and records them in memory', async () => {
    const queue = new DirectPosSyncQueue();

    const job = {
      tenantId: 't-1',
      userId: 'u-1',
      deviceId: 'd-1',
      operation: {
        operationId: '018e245a-0000-7000-8000-000000000001',
        type: 'shift.open',
        sequence: 1,
        payloadHash: 'a'.repeat(64),
        payload: { registerId: 'r-1', initialCashMinor: '1000' },
      },
    };

    const result = await queue.enqueue(job);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.jobId).toBe('direct-job-1');
    }
    expect(queue.getJobs()).toHaveLength(1);
  });

  it('enqueues a batch of jobs in sequence', async () => {
    const queue = new DirectPosSyncQueue();

    const jobs = [
      {
        tenantId: 't-1',
        userId: 'u-1',
        deviceId: 'd-1',
        operation: {
          operationId: '018e245a-0000-7000-8000-000000000001',
          type: 'shift.open',
          sequence: 1,
          payloadHash: 'a'.repeat(64),
          payload: { registerId: 'r-1', initialCashMinor: '1000' },
        },
      },
      {
        tenantId: 't-1',
        userId: 'u-1',
        deviceId: 'd-1',
        operation: {
          operationId: '018e245a-0000-7000-8000-000000000002',
          type: 'shift.close',
          sequence: 2,
          payloadHash: 'b'.repeat(64),
          payload: { shiftId: 's-1', declaredCashMinor: '1000' },
        },
      },
    ];

    const result = await queue.enqueueBatch(jobs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['direct-job-1', 'direct-job-2']);
    }
    expect(queue.getJobs()).toHaveLength(2);
  });

  it('invokes the processor callback if supplied', async () => {
    const processed: string[] = [];
    const queue = new DirectPosSyncQueue((job) => {
      processed.push(job.operation.operationId);
      return Promise.resolve(ok(undefined));
    });

    await queue.enqueue({
      tenantId: 't-1',
      userId: 'u-1',
      deviceId: 'd-1',
      operation: {
        operationId: '018e245a-0000-7000-8000-000000000001',
        type: 'shift.open',
        sequence: 1,
        payloadHash: 'a'.repeat(64),
        payload: { registerId: 'r-1', initialCashMinor: '1000' },
      },
    });

    expect(processed).toEqual(['018e245a-0000-7000-8000-000000000001']);
  });
});
