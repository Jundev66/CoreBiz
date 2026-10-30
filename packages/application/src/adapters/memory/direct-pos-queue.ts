import { ok, err, type Result } from '@corebiz/domain';
import type { PosSyncQueue, PosQueueJobData, PosQueueError } from '../../ports/pos-queue';

export type PosJobProcessor = (job: PosQueueJobData) => Promise<Result<unknown, unknown>>;

export class DirectPosSyncQueue implements PosSyncQueue {
  private counter = 0;
  private readonly enqueuedJobs: PosQueueJobData[] = [];

  constructor(private readonly processor?: PosJobProcessor) {}

  async enqueue(job: PosQueueJobData): Promise<Result<{ readonly jobId: string }, PosQueueError>> {
    this.counter++;
    const jobId = `direct-job-${this.counter}`;
    this.enqueuedJobs.push(job);

    if (this.processor) {
      try {
        await this.processor(job);
      } catch (e) {
        return err({
          kind: 'JobEnqueueFailed',
          reason: e instanceof Error ? e.message : 'Processing error',
        });
      }
    }

    return ok({ jobId });
  }

  async enqueueBatch(
    jobs: readonly PosQueueJobData[],
  ): Promise<Result<readonly string[], PosQueueError>> {
    const jobIds: string[] = [];
    for (const job of jobs) {
      const res = await this.enqueue(job);
      if (!res.ok) {
        return res;
      }
      jobIds.push(res.value.jobId);
    }
    return ok(jobIds);
  }

  getJobs(): readonly PosQueueJobData[] {
    return this.enqueuedJobs;
  }
}
