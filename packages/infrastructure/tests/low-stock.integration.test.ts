import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { systemClock } from '@corebiz/application/ports';
import { postgresRuntime } from '../src/runtime';
import {
  TEST_DATABASE_URL,
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testIds,
  testSql,
  type TestTenant,
} from './support/database';

/**
 * The dashboard's low-stock list, against Postgres.
 *
 * It is the one read model written in SQL instead of the query DSL — the condition compares
 * two columns of the same row — so it is also the one whose filters nobody else checks: the
 * tenant, archived products, products that track no stock and the strict "below".
 *
 * Quantities are stored scaled by a thousand, as the domain writes them.
 */

const sql = testSql();

let tenant: TestTenant;
let other: TestTenant;

async function product(
  owner: TestTenant,
  name: string,
  stock: { onHand: number; minStock: number | null; archived?: boolean },
): Promise<void> {
  await sql`
    insert into public.products (
      id, tenant_id, sku, name, price_minor, price_currency, on_hand, min_stock, archived_at
    ) values (
      ${crypto.randomUUID()}, ${owner.tenantId}, ${`SKU-${crypto.randomUUID().slice(0, 8)}`},
      ${name}, 1000, 'USD', ${stock.onHand * 1000}, ${stock.minStock === null ? null : stock.minStock * 1000},
      ${stock.archived === true ? new Date() : null}
    )
  `;
}

function lowStockOf(owner: TestTenant, limit?: number) {
  const { queries } = postgresRuntime({
    url: TEST_DATABASE_URL,
    ctx: owner.ctx,
    ids: testIds,
    clock: systemClock,
  });
  return queries.products.lowStock(limit);
}

beforeAll(async () => {
  tenant = await createTestTenant();
  other = await createTestTenant();

  await product(tenant, 'Bolsa corta', { onHand: 1, minStock: 5 });
  await product(tenant, 'Arroz corto', { onHand: 0, minStock: 3 });
  await product(tenant, 'Cafe suficiente', { onHand: 10, minStock: 5 });
  await product(tenant, 'Dulce justo', { onHand: 5, minStock: 5 });
  await product(tenant, 'Especia sin minimo', { onHand: 0, minStock: null });
  await product(tenant, 'Fideo archivado', { onHand: 0, minStock: 5, archived: true });

  await product(other, 'Zanahoria ajena', { onHand: 0, minStock: 9 });
});

afterAll(async () => {
  await dropTestTenant(tenant.tenantId);
  await dropTestTenant(other.tenantId);
  await closeTestDatabase();
});

describe('products.lowStock', () => {
  it('lists only active products strictly below their minimum, by name', async () => {
    const rows = await lowStockOf(tenant);

    expect(rows.map((row) => row.name)).toEqual(['Arroz corto', 'Bolsa corta']);
    expect(rows.every((row) => row.belowMinimum && row.trackStock && !row.archived)).toBe(true);
  });

  it('never shows another company’s products', async () => {
    const mine = await lowStockOf(tenant);
    const theirs = await lowStockOf(other);

    expect(mine.map((row) => row.name)).not.toContain('Zanahoria ajena');
    // Control: the other company does see its own, so the empty result above is not a
    // broken context returning nothing.
    expect(theirs.map((row) => row.name)).toEqual(['Zanahoria ajena']);
  });

  it('respects the limit', async () => {
    const rows = await lowStockOf(tenant, 1);

    expect(rows.map((row) => row.name)).toEqual(['Arroz corto']);
  });
});
