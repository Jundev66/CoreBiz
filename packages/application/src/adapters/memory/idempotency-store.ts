import type { IdempotencyRecord, IdempotencyStorePort } from '../../ports/idempotency-store';

interface StoredEntry {
  readonly record: IdempotencyRecord;
  readonly expiresAt: number;
}

export class InMemoryIdempotencyStore implements IdempotencyStorePort {
  private readonly store = new Map<string, StoredEntry>();

  get(key: string): Promise<IdempotencyRecord | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.record);
  }

  set(key: string, record: IdempotencyRecord, ttlSeconds = 86400): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { record, expiresAt });
    return Promise.resolve();
  }

  clear(): void {
    this.store.clear();
  }
}
