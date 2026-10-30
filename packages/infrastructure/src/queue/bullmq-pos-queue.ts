import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ok, err, type Result } from '@corebiz/domain';
import type { PosSyncQueue, PosQueueJobData, PosQueueError } from '@corebiz/application';

export interface BullMqPosQueueConfig {
  readonly redisUrl: string;
  readonly queueName?: string;
}

export class BullMqPosSyncQueue implements PosSyncQueue {
  private readonly queue: Queue<PosQueueJobData>;
  private readonly redis: Redis;

  constructor(config: BullMqPosQueueConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.queue = new Queue<PosQueueJobData>(config.queueName ?? 'pos-sync-operations', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 50,
          age: 3600,
        },
        removeOnFail: {
          count: 100,
          age: 86400,
        },
      },
    });
  }

  async enqueue(job: PosQueueJobData): Promise<Result<{ readonly jobId: string }, PosQueueError>> {
    try {
      const added = await this.queue.add(job.operation.type, job, {
        jobId: job.operation.operationId,
      });

      return ok({ jobId: added.id ?? job.operation.operationId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to enqueue job';
      return err({ kind: 'JobEnqueueFailed', reason });
    }
  }

  async enqueueBatch(
    jobs: readonly PosQueueJobData[],
  ): Promise<Result<readonly string[], PosQueueError>> {
    try {
      const bulkItems = jobs.map((job) => ({
        name: job.operation.type,
        data: job,
        opts: {
          jobId: job.operation.operationId,
        },
      }));

      const addedList = await this.queue.addBulk(bulkItems);
      const ids = addedList.map((j) => j.id ?? '');
      return ok(ids);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to enqueue batch';
      return err({ kind: 'JobEnqueueFailed', reason });
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.redis.disconnect();
  }
}
