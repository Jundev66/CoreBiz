import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import {
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testSql,
  type TestTenant,
} from './support/database';

/**
 * Controls added before the repository went public.
 *
 * Each block covers something an attacker reading the code could otherwise use, and each
 * pairs the refusal with a positive control: a check that only ever sees refusals would
 * pass just as well with a broken context.
 */

const sql = testSql();
const TEMPLATE = '00000000-0000-4000-8000-000000000001';
const TEMPLATE_OWNER = '00000000-0000-4000-8000-000000000002';
const ROLLBACK = 'rollback-on-purpose';
const SUFFIX = Date.now().toString(36);

type Tx = postgres.TransactionSql;

/** Switches the transaction to the end-user role with a tenant context, as the API does. */
async function actAs(tx: Tx, tenantId: string, userId: string): Promise<void> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  await tx`
    select set_config('app.tenant_id', ${tenantId}, true),
           set_config('request.jwt.claims', ${claims}, true),
           set_config('role', 'authenticated', true)
  `;
}

/** Runs `fn` in a transaction that is ALWAYS rolled back, so no test leaves state behind. */
async function inRolledBackTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  await expect(
    sql.begin(async (tx) => {
      await fn(tx);
      throw new Error(ROLLBACK);
    }),
  ).rejects.toThrow(ROLLBACK);
}

afterAll(closeTestDatabase);

describe('the demo template is read-only for end users', () => {
  /*
   * Every visitor sandbox is copied from the template, so whoever writes to it writes into
   * every future sandbox. Its owner account used to ship with a published password. The
   * lock is on by default; local development turns it off in `seed.local.sql`, which is why
   * each test locks it inside its own transaction instead of relying on the global state.
   */
  let other: TestTenant;

  beforeAll(async () => {
    other = await createTestTenant({ slug: `hardening-other-${SUFFIX}` });
  });

  afterAll(async () => {
    await dropTestTenant(other.tenantId);
  });

  const lock = (tx: Tx) =>
    tx`update public.system_flags set value = 'true'::jsonb where key = 'demo_template_locked'`;

  it('every table with tenant_id, and tenants itself, carries the guard trigger', async () => {
    const tables = await sql<{ table_name: string }[]>`
      select distinct table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'tenant_id'
    `;
    const guarded = await sql<{ relname: string }[]>`
      select c.relname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and t.tgname = 'trg_guard_demo_template'
    `;

    const expected = [...tables.map((t) => t.table_name), 'tenants'].sort();
    expect(guarded.map((g) => g.relname).sort()).toEqual(expected);
  });

  it("the template's own owner cannot write to it while locked", async () => {
    await expect(
      sql.begin(async (tx) => {
        await lock(tx);
        await actAs(tx, TEMPLATE, TEMPLATE_OWNER);
        await tx`
          insert into public.customers (id, tenant_id, code, name)
          values (gen_random_uuid(), ${TEMPLATE}, ${`LOCK-${SUFFIX}`}, 'Should never exist')
        `;
      }),
    ).rejects.toThrow(/DEMO_TEMPLATE_LOCKED/);
  });

  it('nor rename the template company', async () => {
    await expect(
      sql.begin(async (tx) => {
        await lock(tx);
        await actAs(tx, TEMPLATE, TEMPLATE_OWNER);
        await tx`update public.tenants set name = 'Defaced' where id = ${TEMPLATE}`;
      }),
    ).rejects.toThrow(/DEMO_TEMPLATE_LOCKED/);
  });

  it('control: an ordinary company is unaffected by the lock', async () => {
    await inRolledBackTx(async (tx) => {
      await lock(tx);
      await actAs(tx, other.tenantId, other.userId);
      const rows = await tx`
        insert into public.customers (id, tenant_id, code, name)
        values (gen_random_uuid(), ${other.tenantId}, ${`OK-${SUFFIX}`}, 'Allowed')
        returning 1
      `;
      expect(rows).toHaveLength(1);
    });
  });

  it('control: the platform role (seed, migrations, definer functions) still writes it', async () => {
    await inRolledBackTx(async (tx) => {
      await lock(tx);
      const rows = await tx`
        update public.tenants set name = name where id = ${TEMPLATE} returning 1
      `;
      expect(rows).toHaveLength(1);
    });
  });
});

describe('admins cannot take or remove ownership', () => {
  /*
   * The use case already refused this; row-level security did not, so any future path that
   * set the tenant context would have let an admin demote the owners or appoint themselves.
   * These run as the end-user role directly against the policies.
   */
  let company: TestTenant; // the only real member is an ADMIN
  let owner: TestTenant; // used only for its user id

  beforeAll(async () => {
    company = await createTestTenant({ slug: `hardening-admin-${SUFFIX}`, role: 'admin' });
    owner = await createTestTenant({ slug: `hardening-owner-${SUFFIX}` });
    await sql`
      insert into public.memberships (tenant_id, user_id, role, status)
      values (${company.tenantId}, ${owner.userId}, 'owner', 'active')
    `;
  });

  afterAll(async () => {
    await dropTestTenant(company.tenantId);
    await dropTestTenant(owner.tenantId);
  });

  it('an admin cannot demote an owner (the row is simply not reachable)', async () => {
    await inRolledBackTx(async (tx) => {
      await actAs(tx, company.tenantId, company.userId);
      const rows = await tx`
        update public.memberships set role = 'sales'
         where tenant_id = ${company.tenantId} and user_id = ${owner.userId}
        returning 1
      `;
      expect(rows).toHaveLength(0);
    });
  });

  it('an admin cannot remove an owner', async () => {
    await inRolledBackTx(async (tx) => {
      await actAs(tx, company.tenantId, company.userId);
      const rows = await tx`
        delete from public.memberships
         where tenant_id = ${company.tenantId} and user_id = ${owner.userId}
        returning 1
      `;
      expect(rows).toHaveLength(0);
    });
  });

  it('an admin cannot promote anyone, themselves included, to owner', async () => {
    await expect(
      sql.begin(async (tx) => {
        await actAs(tx, company.tenantId, company.userId);
        await tx`
          update public.memberships set role = 'owner'
           where tenant_id = ${company.tenantId} and user_id = ${company.userId}
        `;
      }),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('an admin cannot change plan, demo flag or status of the company', async () => {
    for (const column of ['plan_code', 'is_demo', 'status', 'expires_at']) {
      await expect(
        sql.begin(async (tx) => {
          await actAs(tx, company.tenantId, company.userId);
          await tx.unsafe(`update public.tenants set ${column} = ${column} where id = $1`, [
            company.tenantId,
          ]);
        }),
        `column ${column}`,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('control: an admin can still change the settings the screen edits', async () => {
    await inRolledBackTx(async (tx) => {
      await actAs(tx, company.tenantId, company.userId);
      const rows = await tx`
        update public.tenants set tax_label = 'IVA', name = name
         where id = ${company.tenantId} returning 1
      `;
      expect(rows).toHaveLength(1);
    });
  });

  it('control: an admin can still change the role of a non-owner', async () => {
    const colleague = await createTestTenant({ slug: `hardening-colleague-${SUFFIX}` });
    try {
      await sql`
        insert into public.memberships (tenant_id, user_id, role, status)
        values (${company.tenantId}, ${colleague.userId}, 'sales', 'active')
      `;
      await inRolledBackTx(async (tx) => {
        await actAs(tx, company.tenantId, company.userId);
        const rows = await tx`
          update public.memberships set role = 'warehouse'
           where tenant_id = ${company.tenantId} and user_id = ${colleague.userId}
          returning 1
        `;
        expect(rows).toHaveLength(1);
      });
    } finally {
      await sql`delete from public.memberships where tenant_id = ${company.tenantId} and user_id = ${colleague.userId}`;
      await dropTestTenant(colleague.tenantId);
    }
  });
});
