import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@corebiz/domain';
import { usageQuerySchema } from '../src/http/list-queries';

/**
 * `GET /v1/usage?resources=` is bounded.
 *
 * Each listed resource becomes its own database query, run in parallel. With no bound, one
 * request carrying thousands of comma-separated names starved the shared connection pool
 * (ten connections) for every company. Now only the known resources are accepted, each at
 * most once in total count.
 */
describe('usage query', () => {
  it('accepts the known resources', () => {
    const parsed = usageQuerySchema.safeParse({ resources: 'customers, products' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.resources).toEqual(['customers', 'products']);
  });

  it('rejects a resource that does not exist', () => {
    expect(usageQuerySchema.safeParse({ resources: 'customers,passwords' }).success).toBe(false);
  });

  it('rejects more resources than exist, so a request cannot fan out without limit', () => {
    const tooMany = Array.from({ length: RESOURCES.length + 1 }, () => 'customers').join(',');
    expect(usageQuerySchema.safeParse({ resources: tooMany }).success).toBe(false);
  });

  it('rejects an oversized parameter before splitting it', () => {
    expect(usageQuerySchema.safeParse({ resources: 'customers,'.repeat(500) }).success).toBe(false);
  });
});
