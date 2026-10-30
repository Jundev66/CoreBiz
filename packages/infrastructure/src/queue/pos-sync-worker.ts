import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { PosQueueJobData } from '@corebiz/application';

export type PosSyncJobHandler = (job: PosQueueJobData) => Promise<void>;

export interface PosSyncWorkerConfig {
  readonly redisUrl: string;
  readonly queueName?: string;
  readonly concurrency?: number;
  readonly handler: PosSyncJobHandler;
}

export class PosSyncWorker {
  private readonly worker: Worker<PosQueueJobData>;
  private readonly redis: Redis;

  constructor(config: PosSyncWorkerConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    this.worker = new Worker<PosQueueJobData>(
      config.queueName ?? 'pos-sync-operations',
      async (job: Job<PosQueueJobData>) => {
        await config.handler(job.data);
      },
      {
        connection: this.redis,
        concurrency: config.concurrency ?? 2,
      },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
    this.redis.disconnect();
  }
}
