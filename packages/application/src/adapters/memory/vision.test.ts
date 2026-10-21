import { describe, expect, it } from 'vitest';
import type { VisionActorContext } from '@synapse-vision/core';
import { memoryVisionVectorStore } from './vision';

const actor: VisionActorContext = {
  userId: 'u1',
  tenantId: 't1',
  roleName: 'owner',
  permissions: [],
};

const other: VisionActorContext = { ...actor, tenantId: 't2' };

const product = (entityId: string, embedding: readonly number[], label = entityId) =>
  ({ entityType: 'product', entityId, label, embedding }) as const;

describe('memoryVisionVectorStore', () => {
  it('returns the stored record with its cosine score, most similar first', async () => {
    const store = memoryVisionVectorStore({ model: 'nomic-embed-text' });
    await store.upsert(actor, [
      product('far', [0, 1, 0], 'Lejano'),
      product('near', [1, 0, 0], 'Cercano'),
    ]);

    const hits = await store.search(actor, {
      entityType: 'product',
      embedding: [1, 0, 0],
      limit: 5,
    });

    expect(hits.map((hit) => hit.entityId)).toEqual(['near', 'far']);
    expect(hits[0]?.score).toBeCloseTo(1);
    expect(hits[0]?.label).toBe('Cercano');
  });

  it('never crosses the tenant boundary', async () => {
    const store = memoryVisionVectorStore({ model: 'nomic-embed-text' });
    await store.upsert(other, [product('theirs', [1, 0, 0])]);

    expect(
      await store.search(actor, { entityType: 'product', embedding: [1, 0, 0], limit: 5 }),
    ).toEqual([]);
  });

  it('filters by model, so two embedding spaces never mix', async () => {
    const store = memoryVisionVectorStore({ model: 'model-b' });
    // Indexado con el modelo A, buscado con el B: no hay nada que comparar.
    const indexed = memoryVisionVectorStore({ model: 'model-a' });
    await indexed.upsert(actor, [product('p1', [1, 0, 0])]);

    expect(
      await store.search(actor, { entityType: 'product', embedding: [1, 0, 0], limit: 5 }),
    ).toEqual([]);
    expect(
      await indexed.search(actor, { entityType: 'product', embedding: [1, 0, 0], limit: 5 }),
    ).toHaveLength(1);
  });

  it('drops anything below the minimum score and honors the limit', async () => {
    const store = memoryVisionVectorStore({ model: 'm' });
    await store.upsert(actor, [
      product('a', [1, 0, 0]),
      product('b', [0.9, 0.1, 0]),
      product('c', [0, 1, 0]),
    ]);

    const hits = await store.search(actor, {
      entityType: 'product',
      embedding: [1, 0, 0],
      limit: 1,
      minScore: 0.5,
    });

    expect(hits.map((hit) => hit.entityId)).toEqual(['a']);
  });

  it('overwrites the same entity instead of duplicating it', async () => {
    const store = memoryVisionVectorStore({ model: 'm' });
    await store.upsert(actor, [product('p1', [1, 0, 0], 'Viejo')]);
    await store.upsert(actor, [product('p1', [0, 1, 0], 'Nuevo')]);

    const hits = await store.search(actor, {
      entityType: 'product',
      embedding: [0, 1, 0],
      limit: 5,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toBe('Nuevo');
  });

  it('separates products from suppliers', async () => {
    const store = memoryVisionVectorStore({ model: 'm' });
    await store.upsert(actor, [
      product('p1', [1, 0, 0]),
      { entityType: 'supplier', entityId: 's1', label: 's1', embedding: [1, 0, 0] },
    ]);

    const suppliers = await store.search(actor, {
      entityType: 'supplier',
      embedding: [1, 0, 0],
      limit: 5,
    });
    expect(suppliers.map((hit) => hit.entityId)).toEqual(['s1']);
  });
});
