import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Money, Product, Quantity, asId, type ProductId } from '@corebiz/domain';
import { systemClock } from '@corebiz/application';
import { getPrisma } from '@corebiz/db';
import { PrismaUnitOfWork } from '../src/prisma/unit-of-work';
import { PrismaProductRepository } from '../src/prisma/products';
import { withTenant } from '../src/prisma/session';
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
 * Reading a product in order to write it must LOCK its row.
 *
 * This test exists because the bug existed. A QA session reproduced it in the browser: two
 * delivery notes of four units against a stock of five were BOTH issued, and the stock
 * ledger ended with two -4 movements **both with a resulting balance of 1**. Eight units
 * left the warehouse and the system said four.
 *
 * The cause is neither RLS nor the transaction: the balance is not incremented in the
 * database, it is computed in the aggregate and written as an absolute value. Under READ
 * COMMITTED both transactions read five, both compute one, and the second overwrites the
 * first. The table's `on_hand >= 0` does not catch it, because one is greater than zero.
 *
 * ---
 *
 * A DIFFERENT TEST WAS WRITTEN FIRST, AND IT WAS USELESS. It fired both sales with
 * `Promise.all` and checked only one succeeded. It passed with the fix... and also WITHOUT
 * it, because two `$transaction` calls from the same process never interleave: the first
 * finishes before the second reads. A test that is green either way proves nothing and
 * gives false confidence, so it was replaced by this one.
 *
 * This one checks the property the fix introduces, deterministically: another connection
 * holds the row lock, so the repository read MUST wait. With `lock_timeout` that wait
 * becomes an immediate error instead of a slow test. Without `for update`, the read would
 * go straight through — which is exactly the bug.
 */

const prisma = getPrisma(TEST_DATABASE_URL);
const sql = testSql();

function unitOfWork(tenant: TestTenant): PrismaUnitOfWork {
  return new PrismaUnitOfWork({ prisma, ctx: tenant.ctx, ids: testIds, clock: systemClock });
}

function qty(value: string): Quantity {
  const parsed = Quantity.of(value);
  if (!parsed.ok) throw new Error(`Invalid quantity: ${value}`);
  return parsed.value;
}

function aProduct(tenant: TestTenant, sku: string, initialStock: string): Product {
  const price = Money.of('10.00', 'USD');
  if (!price.ok) throw new Error('Invalid test price');

  const created = Product.create({
    id: asId<ProductId>(testIds.next()),
    tenantId: tenant.tenantId,
    sku,
    name: `Producto ${sku}`,
    price: price.value,
    initialStock: qty(initialStock),
    createdAt: new Date(),
  });
  if (!created.ok) throw new Error(`Invalid test product: ${JSON.stringify(created.error)}`);
  return created.value;
}

/** Reads the product through the repository, giving up quickly if the row is locked. */
function readImpatiently(tenant: TestTenant, id: ProductId): Promise<Product | null> {
  return withTenant(prisma, tenant.ctx, async (tx) => {
    // Without this the test would wait out the transaction's twenty seconds. With it, a
    // locked row produces an error within half a second.
    await tx.$executeRaw`set local lock_timeout = '500ms'`;
    return new PrismaProductRepository(tx, tenant.tenantId, testIds).findById(id);
  });
}

describe('Concurrency on inventory', () => {
  let alpha: TestTenant;
  let productId: ProductId;

  beforeAll(async () => {
    alpha = await createTestTenant({ slug: `stock-race-${Date.now().toString(36)}` });

    const product = aProduct(alpha, 'SKU-LOCK', '5');
    productId = product.id;
    await unitOfWork(alpha).run((repos) => repos.products.save(product));
  });

  afterAll(async () => {
    await dropTestTenant(alpha.tenantId);
    await closeTestDatabase();
  });

  it('with nobody competing, the read returns the product', async () => {
    // Positive control: if this failed, the test below would pass for the wrong reason —
    // the `lock_timeout` or the context, not the lock.
    const product = await readImpatiently(alpha, productId);
    expect(product?.onHand.scaledValue).toBe(qty('5').scaledValue);
  });

  it('with the row locked by another transaction, the read waits instead of reading a stale balance', async () => {
    // Another connection, as another HTTP request would be, taking the same lock the
    // repository takes when it reads in order to write.
    const other = await sql.reserve();

    try {
      await other`begin`;
      await other`select 1 from public.products where id = ${productId}::uuid for update`;

      // This is what is tested: the repository read competes for the lock and waits.
      // Without `for update` it would read the old balance and carry on, which is how
      // eight units were sold out of five.
      await expect(readImpatiently(alpha, productId)).rejects.toThrow(/lock|timeout|55P03/i);
    } finally {
      await other`commit`;
      other.release();
    }
  });
});
