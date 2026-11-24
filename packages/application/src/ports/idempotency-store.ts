export interface IdempotencyRecord {
  readonly status: 'pending' | 'completed';
  readonly statusCode: number;
  readonly body: unknown;
  readonly createdAt: string;
}

export interface IdempotencyStorePort {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds?: number): Promise<void>;
  clear?(): void;
}
