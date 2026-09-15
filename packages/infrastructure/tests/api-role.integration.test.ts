import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  type TestTenant,
} from './support/database';

/**
 * The role the API connects with.
 *
 * Isolation between companies used to rest on one habit: every query inside a transaction
 * that lowers the role to `authenticated`. The connection itself was `postgres`, which
 * bypasses row-level security, so a query written outside that transaction would have read
 * every company. These tests pin down that the role itself refuses, whatever the code does.
 *
 * The password is the LOCAL one from `supabase/seed.local.sql`; production sets its own.
 */
const API_ROLE_URL =
  process.env.API_ROLE_DATABASE_URL ??
  'postgresql://corebiz_api:corebiz-api-local@127.0.0.1:54322/postgres';

/** Postgres `insufficient_privilege`. */
const PERMISSION_DENIED = '42501';

let api: postgres.Sql;
let tenant: TestTenant;
let other: TestTenant;

async function codeOf(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeAll(async () => {
  api = postgres(API_ROLE_URL, { max: 1, prepare: false, ssl: false });
  tenant = await createTestTenant();
  other = await createTestTenant();
});

afterAll(async () => {
  await dropTestTenant(tenant.tenantId);
  await dropTestTenant(other.tenantId);
  await api.end({ timeout: 5 });
  await closeTestDatabase();
});

describe('the API database role', () => {
  it('cannot bypass row-level security and holds no administrative attribute', async () => {
    const [role] = await api<
      { bypass: boolean; superuser: boolean; createrole: boolean; inherit: boolean }[]
    >`
      select rolbypassrls as bypass, rolsuper as superuser, rolcreaterole as createrole,
             rolinherit as inherit
        from pg_roles where rolname = current_user
    `;

    expect(role).toEqual({ bypass: false, superuser: false, createrole: false, inherit: false });
  });

  it('cannot read a company table outside a tenant transaction', async () => {
    expect(await codeOf(api`select count(*) from public.tenants`)).toBe(PERMISSION_DENIED);
    expect(await codeOf(api`select count(*) from public.customers`)).toBe(PERMISSION_DENIED);
  });

  it('cannot read the accounts of the authentication service', async () => {
    expect(await codeOf(api`select count(*) from auth.users`)).toBe(PERMISSION_DENIED);
  });

  it('becomes authenticated inside a transaction and sees only its own company', async () => {
    const visible = await api.begin(async (tx) => {
      const claims = JSON.stringify({ sub: tenant.userId, role: 'authenticated' });
      await tx`
        select set_config('app.tenant_id', ${tenant.tenantId}::text, true),
               set_config('request.jwt.claims', ${claims}::text, true),
               set_config('role', 'authenticated', true)
      `;
      return tx<{ id: string }[]>`select id from public.tenants`;
    });

    expect(visible.map((row) => row.id)).toEqual([tenant.tenantId]);
  });

  it('runs the platform functions the API calls', async () => {
    const [sessions] = await api<{ n: number }[]>`
      select app.count_demo_sessions('sandbox', 3600, true, null) as n
    `;
    expect(typeof sessions?.n).toBe('number');

    const [alive] = await api<{ alive: boolean }[]>`
      select app.demo_sandbox_is_alive(${tenant.tenantId}::uuid) as alive
    `;
    // A regular company is not a demo sandbox.
    expect(alive?.alive).toBe(false);

    const [hit] = await api<{ allowed: boolean }[]>`
      select allowed from security.rate_limit_hit(${`api-role-test:${randomUUID()}`}, 5, 60)
    `;
    expect(hit?.allowed).toBe(true);

    const capacity = await api`select * from app.demo_capacity(500000000)`;
    expect(capacity).toHaveLength(1);
  });

  it('cannot run the platform functions it was not granted', async () => {
    expect(await codeOf(api`select app.clone_demo_tenant(${other.tenantId}::uuid, null, 1)`)).toBe(
      PERMISSION_DENIED,
    );
  });
});
