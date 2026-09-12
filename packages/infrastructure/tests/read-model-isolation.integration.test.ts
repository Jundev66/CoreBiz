import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReadModels } from '@corebiz/application';
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
 * Read models do not cross companies.
 *
 * The matrix in `rls-isolation.integration.test.ts` tests the POLICIES: raw SQL with the
 * context set. This file tests the layer above, which is what the assistant will actually
 * call: every `ReadModels` method that takes an id or returns a list, built exactly as the
 * API builds it.
 *
 * The difference matters. A perfect policy does not protect against a read model that
 * opens its transaction with the wrong client, or resolves a join outside the context; and
 * these methods are the ones the assistant will turn into tools, with a language model
 * deciding which ids to pass.
 *
 * Every "does not see someone else's" check comes with a "DOES see its own" check. Without
 * it, a broken context returning nothing would pass every test: zero foreign rows proves
 * nothing if there are no own rows either.
 */

const sql = testSql();
const SUFFIX = Date.now().toString(36);

interface Seeded {
  readonly marker: string;
  readonly customerId: string;
  readonly productId: string;
  readonly noteId: string;
  readonly supplierId: string;
  readonly receiptId: string;
}

/**
 * One row of everything the assistant will be able to query, with a marker in the name.
 *
 * Seeded as `postgres`, which bypasses RLS: the scaffolding cannot be subject to what it
 * verifies. The marker goes into everything a read model returns as text — customer,
 * product and supplier names, line descriptions — so it can be searched for in the whole
 * serialized result, not only in the fields one happens to think of.
 */
async function seed(tenant: TestTenant, marker: string): Promise<Seeded> {
  const t = tenant.tenantId;
  const ids = {
    customerId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    noteId: crypto.randomUUID(),
    supplierId: crypto.randomUUID(),
    receiptId: crypto.randomUUID(),
  };

  await sql`
    insert into public.customers (id, tenant_id, code, name)
    values (${ids.customerId}, ${t}, 'CLI-ISO', ${`Cliente ${marker}`})
  `;
  await sql`
    insert into public.products (id, tenant_id, sku, name, price_minor, price_currency, on_hand)
    values (${ids.productId}, ${t}, 'SKU-ISO', ${`Producto ${marker}`}, 1000, 'USD', 50000)
  `;
  await sql`
    insert into public.stock_movements
      (id, tenant_id, product_id, kind, quantity, balance_after, ref_type, occurred_at)
    values (${crypto.randomUUID()}, ${t}, ${ids.productId}, 'in', 50000, 50000, 'initial', now())
  `;
  await sql`
    insert into public.delivery_notes (
      id, tenant_id, number, customer_id, status, currency,
      exchange_rate_scaled, exchange_rate_from, exchange_rate_to, exchange_rate_at,
      tax_label_snapshot, tax_rate_bp_snapshot,
      subtotal_minor, tax_minor, total_minor, total_secondary_minor, issued_at
    ) values (
      ${ids.noteId}, ${t}, 'NE-ISO-001', ${ids.customerId}, 'issued', 'USD',
      3650000000, 'USD', 'VES', now(),
      'Impuesto informativo', 1600,
      1000, 160, 1160, 42340, now()
    )
  `;
  await sql`
    insert into public.delivery_note_lines (
      tenant_id, delivery_note_id, line_no, product_id,
      description_snapshot, unit_snapshot, quantity, unit_price_minor, line_total_minor
    ) values (${t}, ${ids.noteId}, 1, ${ids.productId}, ${`Producto ${marker}`}, 'und', 1000, 1000, 1000)
  `;
  await sql`
    insert into public.suppliers (id, tenant_id, code, name)
    values (${ids.supplierId}, ${t}, 'PRV-ISO', ${`Proveedor ${marker}`})
  `;
  await sql`
    insert into public.goods_receipts (
      id, tenant_id, number, supplier_id, status, currency, total_minor, received_at
    ) values (${ids.receiptId}, ${t}, 'RM-ISO-001', ${ids.supplierId}, 'received', 'USD', 1000, now())
  `;
  await sql`
    insert into public.goods_receipt_lines (
      tenant_id, goods_receipt_id, line_no, product_id,
      description_snapshot, unit_snapshot, quantity, unit_cost_minor, line_total_minor
    ) values (${t}, ${ids.receiptId}, 1, ${ids.productId}, ${`Producto ${marker}`}, 'und', 1000, 1000, 1000)
  `;
  await sql`
    insert into public.audit_log (id, tenant_id, actor_id, action, entity_type, entity_id)
    values (${crypto.randomUUID()}, ${t}, ${tenant.userId}, 'iso.probe', 'customer', ${ids.customerId})
  `;

  return { marker, ...ids };
}

/** A company's read models, built the same way the API builds them. */
function readsOf(tenant: TestTenant): ReadModels {
  return postgresRuntime({
    url: TEST_DATABASE_URL,
    ctx: tenant.ctx,
    ids: testIds,
    clock: systemClock,
  }).queries;
}

let alpha: TestTenant;
let beta: TestTenant;
let sales: TestTenant;
let ofAlpha: Seeded;
let ofBeta: Seeded;

beforeAll(async () => {
  alpha = await createTestTenant({ slug: `iso-alfa-${SUFFIX}` });
  beta = await createTestTenant({ slug: `iso-beta-${SUFFIX}` });
  // A separate company whose only member is in sales, for the audit log.
  sales = await createTestTenant({ slug: `iso-ventas-${SUFFIX}`, role: 'sales' });

  ofAlpha = await seed(alpha, `ALFA-${SUFFIX}`);
  ofBeta = await seed(beta, `BETA-${SUFFIX}`);
  await seed(sales, `VENTAS-${SUFFIX}`);
});

afterAll(async () => {
  await dropTestTenant(alpha.tenantId);
  await dropTestTenant(beta.tenantId);
  await dropTestTenant(sales.tenantId);
  await closeTestDatabase();
});

describe('precondition: the seeded rows exist and each company sees its own', () => {
  it("beta's rows really exist", async () => {
    // Seen as `postgres`. If this failed, every "alpha does not see beta's" would pass
    // vacuously.
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.customers where tenant_id = ${beta.tenantId}::uuid
    `;
    expect(row?.n).toBeGreaterThan(0);
  });

  it('alpha finds its own by id and in its lists', async () => {
    const q = readsOf(alpha);

    expect(await q.customers.byId(ofAlpha.customerId)).not.toBeNull();
    expect(await q.products.byId(ofAlpha.productId)).not.toBeNull();
    expect(await q.products.movements(ofAlpha.productId)).not.toHaveLength(0);
    expect(await q.deliveryNotes.findById(ofAlpha.noteId)).not.toBeNull();
    expect(await q.purchasing.supplierById(ofAlpha.supplierId)).not.toBeNull();
    expect(await q.purchasing.receiptById(ofAlpha.receiptId)).not.toBeNull();

    expect(JSON.stringify(await q.customers.list({ includeArchived: true }))).toContain(
      ofAlpha.marker,
    );
  });
});

describe("another company's id yields nothing", () => {
  /*
   * The direct attack on an assistant with tools: the model receives an id — from a
   * conversation, a pasted link, a document someone dictated — and passes it through. The
   * answer must be the same as for a made-up id: null. Not a different error, not a partial
   * object.
   */
  it.each([
    ['customers.byId', (q: ReadModels) => q.customers.byId(ofBeta.customerId)],
    ['products.byId', (q: ReadModels) => q.products.byId(ofBeta.productId)],
    ['deliveryNotes.findById', (q: ReadModels) => q.deliveryNotes.findById(ofBeta.noteId)],
    ['purchasing.supplierById', (q: ReadModels) => q.purchasing.supplierById(ofBeta.supplierId)],
    ['purchasing.receiptById', (q: ReadModels) => q.purchasing.receiptById(ofBeta.receiptId)],
  ])('%s returns null', async (_name, query) => {
    expect(await query(readsOf(alpha))).toBeNull();
  });

  it("products.movements of someone else's product returns an empty list", async () => {
    // It takes an id but returns a list, so "nothing" has a different shape. Being empty
    // rather than an error is what makes "not yours" indistinguishable from "no movements".
    expect(await readsOf(alpha).products.movements(ofBeta.productId)).toEqual([]);
  });
});

describe('an id that cannot be a key yields nothing, not an error', () => {
  /*
   * THIS USED TO BE A 500. On Postgres the id travels as `uuid`, so text that is not one —
   * `abc`, a half-copied id, the tail of an old URL — did not return zero rows: it failed
   * in the database with `22P02 invalid input syntax for type uuid` and reached the user as
   * the server error page with an incident reference. A typo in the address bar was enough.
   *
   * The two adapters also disagreed: the in-memory double compares strings, so it answered
   * null and the default suite could not see it. The fix lives in `src/prisma/record-id.ts`
   * and returns the same as for a made-up id.
   *
   * This test guards the whole family: whoever adds a new `byId` without the check must add
   * its line here — otherwise the 500 comes back with nothing turning red. The cases cover
   * the ways to fail: text that is not a uuid, a uuid missing a digit, an empty string, and
   * injection-shaped text.
   */
  const IMPOSSIBLE = ['abc', '00000000-0000-0000-0000-0000000c001', '', 'null', '1 or 1=1'];

  it.each(IMPOSSIBLE)('customers.byId(%j) returns null', async (id) => {
    expect(await readsOf(alpha).customers.byId(id)).toBeNull();
  });

  it.each(IMPOSSIBLE)('products.byId(%j) returns null', async (id) => {
    expect(await readsOf(alpha).products.byId(id)).toBeNull();
  });

  it.each(IMPOSSIBLE)('deliveryNotes.findById(%j) returns null', async (id) => {
    expect(await readsOf(alpha).deliveryNotes.findById(id)).toBeNull();
  });

  it.each(IMPOSSIBLE)('purchasing.supplierById(%j) returns null', async (id) => {
    expect(await readsOf(alpha).purchasing.supplierById(id)).toBeNull();
  });

  it.each(IMPOSSIBLE)('purchasing.receiptById(%j) returns null', async (id) => {
    expect(await readsOf(alpha).purchasing.receiptById(id)).toBeNull();
  });

  it.each(IMPOSSIBLE)('products.movements(%j) returns an empty list', async (id) => {
    expect(await readsOf(alpha).products.movements(id)).toEqual([]);
  });
});

describe("one company's lists contain nothing from another", () => {
  /*
   * Beta's marker is searched for in the WHOLE serialized result, not in one field. A
   * foreign customer name leaking into a note's `customerName`, or into a line description
   * of a sales summary, is the leak a field-by-field test misses.
   */
  it.each([
    ['customers.list', (q: ReadModels) => q.customers.list({ includeArchived: true })],
    ['customers.options', (q: ReadModels) => q.customers.options()],
    ['products.list', (q: ReadModels) => q.products.list({ includeArchived: true })],
    ['products.options', (q: ReadModels) => q.products.options()],
    ['deliveryNotes.list', (q: ReadModels) => q.deliveryNotes.list({})],
    ['purchasing.suppliers', (q: ReadModels) => q.purchasing.suppliers({ includeArchived: true })],
    ['purchasing.supplierOptions', (q: ReadModels) => q.purchasing.supplierOptions()],
    ['purchasing.receipts', (q: ReadModels) => q.purchasing.receipts({})],
    ['reports.salesSummary', (q: ReadModels) => q.reports.salesSummary()],
  ])('%s', async (_name, query) => {
    const serialized = JSON.stringify(await query(readsOf(alpha)));
    expect(serialized).not.toContain(ofBeta.marker);
  });

  it('admin.team only lists its own members', async () => {
    const team = await readsOf(alpha).admin.team();
    const ids = team.map((m) => m.userId);

    expect(ids).toContain(alpha.userId);
    expect(ids).not.toContain(beta.userId);
  });
});

describe('not everyone can read the audit log', () => {
  it('the owner sees their own', async () => {
    const page = await readsOf(alpha).admin.auditLog({});
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('a sales member sees no entries, even when there are some', async () => {
    // Precondition as `postgres`: the entry exists in THEIR company. What is tested is not
    // isolation between companies but within one: who did what is not information for
    // colleagues without an administrative role.
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.audit_log where tenant_id = ${sales.tenantId}::uuid
    `;
    expect(row?.n).toBeGreaterThan(0);

    const page = await readsOf(sales).admin.auditLog({});
    expect(page.items).toHaveLength(0);
  });
});
