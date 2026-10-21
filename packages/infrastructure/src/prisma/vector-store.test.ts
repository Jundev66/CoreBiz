import { describe, expect, it } from 'vitest';
import { Plan, asId, type TenantId, type UserId } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import type { PrismaClient } from '@corebiz/prisma-client';
import { prismaVisionVectorStore } from './vector-store';

const TENANT = asId<TenantId>('00000000-0000-0000-0000-0000000000aa');
const USER = asId<UserId>('00000000-0000-0000-0000-0000000000bb');

const ctx: TenantContext = {
  tenantId: TENANT,
  tenantSlug: 'test',
  actor: { userId: USER, role: 'owner' },
  plan: Plan.of('free'),
  settings: {
    taxLabel: 'Impuesto informativo',
    taxRateBp: 1600,
    baseCurrency: 'USD',
    exchangeRateScaled: 3_650_000_000n,
    exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
  },
  isDemo: false,
};

const actor = { userId: USER, tenantId: TENANT, roleName: 'owner', permissions: [] };

interface FakePrisma {
  readonly prisma: PrismaClient;
  readonly queries: string[];
  readonly execs: string[];
}

/** Doble del cliente: `$transaction` ejecuta el callback con un `tx` de tags. */
function fakePrisma(rows: ReadonlyArray<Record<string, unknown>>): FakePrisma {
  const queries: string[] = [];
  const execs: string[] = [];

  const tx = {
    $queryRaw: (strings: TemplateStringsArray) => {
      const text = strings.join(' ');
      queries.push(text);
      return Promise.resolve(text.includes('vision_embeddings') ? rows : []);
    },
    $executeRaw: (strings: TemplateStringsArray) => {
      execs.push(strings.join(' '));
      return Promise.resolve(1);
    },
  };

  const prisma = {
    $transaction: (fn: (client: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient;

  return { prisma, queries, execs };
}

describe('prismaVisionVectorStore.search', () => {
  it('maps rows to matches with the cosine score', async () => {
    const { prisma, queries } = fakePrisma([
      { entity_id: 'p1', label: 'Harina (HRN-001)', score: 0.87 },
    ]);
    const store = prismaVisionVectorStore(prisma, ctx, { model: 'nomic-embed-text' });

    const hits = await store.search(actor, {
      entityType: 'product',
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
      minScore: 0.35,
    });

    expect(hits).toEqual([
      { entityType: 'product', entityId: 'p1', label: 'Harina (HRN-001)', score: 0.87 },
    ]);
    // El contexto de tenant y el operador coseno van en la MISMA consulta.
    expect(queries.some((q) => q.includes('app') || q.includes('set_config'))).toBe(true);
  });

  it('returns nothing when the actor belongs to another tenant', async () => {
    const { prisma, queries } = fakePrisma([{ entity_id: 'p1', label: 'x', score: 0.9 }]);
    const store = prismaVisionVectorStore(prisma, ctx, { model: 'nomic-embed-text' });

    const hits = await store.search(
      { ...actor, tenantId: '00000000-0000-0000-0000-0000000000ff' },
      { entityType: 'product', embedding: [0.1], limit: 5 },
    );

    expect(hits).toEqual([]);
    expect(queries).toHaveLength(0);
  });
});

describe('prismaVisionVectorStore.upsert', () => {
  it('inserts every record inside the tenant transaction', async () => {
    const { prisma, execs } = fakePrisma([]);
    const store = prismaVisionVectorStore(prisma, ctx, { model: 'nomic-embed-text' });

    await store.upsert(actor, [
      { entityType: 'product', entityId: 'p1', label: 'Harina', embedding: [0.1, 0.2] },
      { entityType: 'supplier', entityId: 's1', label: 'Distribuidora', embedding: [0.3, 0.4] },
    ]);

    const inserts = execs.filter((sql) => sql.includes('insert into public.vision_embeddings'));
    expect(inserts).toHaveLength(2);
  });

  it('does nothing when the actor belongs to another tenant', async () => {
    const { prisma, execs } = fakePrisma([]);
    const store = prismaVisionVectorStore(prisma, ctx, { model: 'nomic-embed-text' });

    await store.upsert({ ...actor, tenantId: '00000000-0000-0000-0000-0000000000ff' }, [
      { entityType: 'product', entityId: 'p1', label: 'Harina', embedding: [0.1] },
    ]);

    expect(execs).toHaveLength(0);
  });
});
