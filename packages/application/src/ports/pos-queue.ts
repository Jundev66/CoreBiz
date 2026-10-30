import type { Result } from '@corebiz/domain';

export interface PosQueueJobData {
  readonly tenantId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly operation: {
    readonly operationId: string;
    readonly type: string;
    readonly sequence: number;
    readonly payloadHash: string;
    readonly payload: Record<string, unknown>;
  };
}

export type PosQueueError =
  | { readonly kind: 'QueueUnavailable'; readonly reason: string }
  | { readonly kind: 'JobEnqueueFailed'; readonly reason: string };

export interface PosSyncQueue {
  enqueue(job: PosQueueJobData): Promise<Result<{ readonly jobId: string }, PosQueueError>>;
  enqueueBatch(jobs: readonly PosQueueJobData[]): Promise<Result<readonly string[], PosQueueError>>;
}
