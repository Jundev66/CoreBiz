import { describe, expect, it } from 'vitest';
import { InMemoryIdempotencyStore, type IdempotencyRecord } from '../../src';

describe('InMemoryIdempotencyStore', () => {
  it('stores and retrieves idempotency records correctly', async () => {
    const store = new InMemoryIdempotencyStore();
    const record: IdempotencyRecord = {
      status: 'completed',
      statusCode: 201,
      body: { ok: true, invoiceId: 'inv-123' },
      createdAt: new Date().toISOString(),
    };

    await store.set('idemp-key-1', record);
    const retrieved = await store.get('idemp-key-1');

    expect(retrieved).toEqual(record);
  });

  it('returns null for nonexistent keys', async () => {
    const store = new InMemoryIdempotencyStore();
    const result = await store.get('nonexistent-key');
    expect(result).toBeNull();
  });

  it('expires records after ttlSeconds elapse', async () => {
    const store = new InMemoryIdempotencyStore();
    const record: IdempotencyRecord = {
      status: 'pending',
      statusCode: 0,
      body: null,
      createdAt: new Date().toISOString(),
    };

    await store.set('expired-key', record, -1);
    const result = await store.get('expired-key');

    expect(result).toBeNull();
  });

  it('clears all entries when requested', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set('k1', {
      status: 'completed',
      statusCode: 200,
      body: {},
      createdAt: new Date().toISOString(),
    });

    store.clear();
    const result = await store.get('k1');
    expect(result).toBeNull();
  });
});
