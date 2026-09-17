import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@corebiz/db';
import { PrismaUnitOfWork } from '../src/prisma/unit-of-work';
import { aesGcmSecretBox } from '../src/crypto/secret-box';
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
 * The AI connection against real Postgres.
 *
 * Cross-company isolation is already in the generic RLS matrix. What only this file proves is
 * the line INSIDE a company: every member reads the connection (the assistant needs it), and
 * only owner and admin can change it — enforced by the policies, not by the use case alone.
 */

const sql = testSql();
const clock = { now: () => new Date() };

let owner: TestTenant;
let seller: TestTenant;

const uow = (tenant: TestTenant) =>
  new PrismaUnitOfWork({
    prisma: getPrisma(TEST_DATABASE_URL),
    ctx: tenant.ctx,
    ids: testIds,
    clock,
  });

beforeAll(async () => {
  owner = await createTestTenant({ slug: `ai-owner-${Date.now()}` });
  seller = await createTestTenant({ slug: `ai-seller-${Date.now()}`, role: 'sales' });
});

afterAll(async () => {
  await dropTestTenant(owner.tenantId);
  await dropTestTenant(seller.tenantId);
  await closeTestDatabase();
});

describe('tenant_ai_settings', () => {
  it('an owner saves, reads back and removes the connection, with the key sealed', async () => {
    const box = aesGcmSecretBox(randomBytes(32).toString('base64'));
    const sealed = box.seal('sk-ant-integration', owner.tenantId);

    await uow(owner).run((repos) =>
      repos.aiSettings.save({
        provider: 'anthropic',
        baseUrl: null,
        apiKeyCiphertext: sealed,
        apiKeyHint: 'tion',
        model: 'claude-sonnet-5',
        updatedAt: new Date(),
      }),
    );

    const [row] = await sql<{ api_key_ciphertext: string; updated_by: string }[]>`
      select api_key_ciphertext, updated_by from public.tenant_ai_settings
       where tenant_id = ${owner.tenantId}
    `;
    expect(row?.api_key_ciphertext).not.toContain('sk-ant-integration');
    expect(row?.updated_by).toBe(owner.userId);

    const found = await uow(owner).run((repos) => repos.aiSettings.find());
    expect(found?.model).toBe('claude-sonnet-5');
    expect(box.open(found!.apiKeyCiphertext!, owner.tenantId)).toBe('sk-ant-integration');

    await uow(owner).run((repos) => repos.aiSettings.remove());
    expect(await uow(owner).run((repos) => repos.aiSettings.find())).toBeNull();
  });

  it('a seller reads the connection but the database refuses their write', async () => {
    await sql`
      insert into public.tenant_ai_settings (tenant_id, provider, base_url, model)
      values (${seller.tenantId}, 'ollama', 'https://ollama.example.com', 'llama3.2')
    `;

    expect((await uow(seller).run((repos) => repos.aiSettings.find()))?.model).toBe('llama3.2');

    await expect(
      uow(seller).run((repos) =>
        repos.aiSettings.save({
          provider: 'openai_compatible',
          baseUrl: 'https://attacker.example.com/v1',
          apiKeyCiphertext: null,
          apiKeyHint: null,
          model: 'x',
          updatedAt: new Date(),
        }),
      ),
    ).rejects.toThrow();

    // Delete is filtered by the policy: zero rows, and the row survives.
    await uow(seller).run((repos) => repos.aiSettings.remove());
    const [row] = await sql<{ model: string }[]>`
      select model from public.tenant_ai_settings where tenant_id = ${seller.tenantId}
    `;
    expect(row?.model).toBe('llama3.2');
  });
});
