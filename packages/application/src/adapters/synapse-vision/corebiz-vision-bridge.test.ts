import { describe, expect, it } from 'vitest';
import type {
  VisionActorContext,
  VisionEmbeddingsPort,
  VisionVectorMatch,
  VisionVectorStorePort,
} from '@synapse-vision/core';
import type { ProductListItem, ProductQueries } from '../../queries/read-models';
import { CoreBizVisionBridgeAdapter, type VisionRag } from './corebiz-vision-bridge';

const actor: VisionActorContext = {
  userId: 'u1',
  tenantId: 't1',
  roleName: 'owner',
  permissions: [],
};

function product(id: string, sku: string, name: string): ProductListItem {
  return {
    id,
    sku,
    name,
    unit: 'kg',
    price: '1.00',
    trackStock: true,
    onHand: '0',
    belowMinimum: false,
    archived: false,
  };
}

interface ProductStub {
  readonly queries: ProductQueries;
  readonly calls: { list: number; byId: readonly string[] };
}

function fakeProducts(
  items: readonly ProductListItem[],
  details: Record<string, ProductListItem> = {},
): ProductStub {
  const calls = { list: 0, byId: [] as string[] };
  const list = () => {
    calls.list += 1;
    return Promise.resolve({ items, nextCursor: null });
  };
  const byId = (id: string) => {
    calls.byId.push(id);
    return Promise.resolve(details[id] ?? null);
  };
  return { queries: { list, byId } as unknown as ProductQueries, calls };
}

interface RagStub {
  readonly rag: VisionRag;
  readonly calls: { embed: number };
  respondWith(results: readonly VisionVectorMatch[]): void;
  failEmbeddings(): void;
}

function fakeRag(): RagStub {
  const calls = { embed: 0 };
  let results: readonly VisionVectorMatch[] = [];
  let embed = (texts: readonly string[]): Promise<readonly number[][]> =>
    Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));

  const embeddings = {
    embed: ({ texts }: { texts: readonly string[] }) => {
      calls.embed += 1;
      return embed(texts);
    },
  } as unknown as VisionEmbeddingsPort;

  const store = {
    search: () => Promise.resolve(results),
    upsert: () => Promise.resolve(),
  } as unknown as VisionVectorStorePort;

  return {
    rag: { embeddings, store },
    calls,
    respondWith: (next) => {
      results = next;
    },
    failEmbeddings: () => {
      embed = () => Promise.reject(new Error('provider down'));
    },
  };
}

describe('CoreBizVisionBridgeAdapter without RAG', () => {
  it('resolves by text and scores the suggestion at 0.5', async () => {
    const products = fakeProducts([product('p1', 'HRN-001', 'Harina P.A.N.')]);
    const bridge = new CoreBizVisionBridgeAdapter(products.queries);

    const matches = await bridge.matchProduct(actor, 'harina');

    expect(matches).toEqual([
      { productId: 'p1', sku: 'HRN-001', name: 'Harina P.A.N.', confidence: 0.5 },
    ]);
    expect(products.calls.list).toBe(1);
  });

  it('returns nothing for a blank description without touching the catalog', async () => {
    const products = fakeProducts([product('p1', 'X', 'X')]);
    const bridge = new CoreBizVisionBridgeAdapter(products.queries);

    expect(await bridge.matchProduct(actor, '   ')).toEqual([]);
    expect(products.calls.list).toBe(0);
  });

  it('cannot resolve a supplier', async () => {
    const bridge = new CoreBizVisionBridgeAdapter(fakeProducts([]).queries);
    expect(await bridge.resolveSupplier(actor, 'Distribuidora')).toBeNull();
  });
});

describe('CoreBizVisionBridgeAdapter with RAG', () => {
  it('resolves by meaning and enriches the hit with the real sku', async () => {
    const products = fakeProducts([], { p1: product('p1', 'HRN-001', 'Harina P.A.N.') });
    const rag = fakeRag();
    rag.respondWith([{ entityType: 'product', entityId: 'p1', label: 'Harina', score: 0.91 }]);
    const bridge = new CoreBizVisionBridgeAdapter(products.queries, rag.rag);

    const matches = await bridge.matchProduct(actor, 'harina de maiz');

    expect(matches).toEqual([
      { productId: 'p1', sku: 'HRN-001', name: 'Harina P.A.N.', confidence: 0.91 },
    ]);
    // El texto NO se consulta: la coincidencia semantica manda.
    expect(products.calls.list).toBe(0);
    expect(rag.calls.embed).toBe(1);
  });

  it('drops a hit whose entity no longer exists in the catalog', async () => {
    const products = fakeProducts([]);
    const rag = fakeRag();
    rag.respondWith([{ entityType: 'product', entityId: 'gone', label: 'x', score: 0.9 }]);
    const bridge = new CoreBizVisionBridgeAdapter(products.queries, rag.rag);

    expect(await bridge.matchProduct(actor, 'algo')).toEqual([]);
    expect(products.calls.list).toBe(0);
  });

  it('falls back to text when the embeddings provider fails', async () => {
    const products = fakeProducts([product('p1', 'HRN-001', 'Harina')]);
    const rag = fakeRag();
    rag.failEmbeddings();
    const bridge = new CoreBizVisionBridgeAdapter(products.queries, rag.rag);

    const matches = await bridge.matchProduct(actor, 'harina');

    expect(matches).toEqual([{ productId: 'p1', sku: 'HRN-001', name: 'Harina', confidence: 0.5 }]);
    expect(products.calls.list).toBe(1);
  });

  it('resolves a supplier by meaning', async () => {
    const rag = fakeRag();
    rag.respondWith([
      { entityType: 'supplier', entityId: 's1', label: 'Distribuidora', score: 0.8 },
    ]);
    const bridge = new CoreBizVisionBridgeAdapter(fakeProducts([]).queries, rag.rag);

    expect(await bridge.resolveSupplier(actor, 'Distribuidora')).toBe('s1');
  });
});
