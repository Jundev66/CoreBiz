import { describe, expect, it, beforeEach } from 'vitest';
import { ROLES, asId, type Role, type TenantId, type UserId } from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  createSalesStores,
  makeTestContext,
  stubAiGateway,
  testSecretBox,
  type SalesStores,
  type StubAiGatewayOptions,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import type { AiSettingsRecord, SecretBox } from '../../ports/ai';
import {
  makeGetAiSettings,
  makeListAiModels,
  makeRemoveAiSettings,
  makeSaveAiSettings,
} from './manage-ai-settings';
import { ASSISTANT_LIMITS, makeAskAssistant, makeAssistantStatus } from './ask-assistant';
import { ASSISTANT_SCREENS, assistantSystemPrompt } from './system-prompt';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-09-17T12:00:00.000Z');
const KEY = 'sk-ant-api03-secret-1234';

describe('AI assistant', () => {
  let stores: SalesStores;
  let uow: InMemoryUnitOfWork;

  beforeEach(() => {
    stores = createSalesStores();
    uow = new InMemoryUnitOfWork(stores, stores.usage, TENANT);
  });

  const ctxAs = (role: Role) =>
    makeTestContext({ tenantId: TENANT, actor: { userId: asId<UserId>('user-test'), role } });

  function setup(
    role: Role = 'owner',
    gatewayOptions: StubAiGatewayOptions = { acceptedKey: KEY },
    secrets: SecretBox = testSecretBox(),
  ) {
    const stub = stubAiGateway(gatewayOptions);
    const deps = { uow, ctx: ctxAs(role), clock: fixedClock(NOW), gateway: stub.gateway, secrets };
    return {
      stub,
      get: makeGetAiSettings(deps),
      list: makeListAiModels(deps),
      save: makeSaveAiSettings(deps),
      remove: makeRemoveAiSettings(deps),
      status: makeAssistantStatus(deps),
      ask: makeAskAssistant(deps),
    };
  }

  const stored = () => stores.aiSettings.get(TENANT) as AiSettingsRecord | undefined;

  describe('permissions', () => {
    it('only owner and admin can see, test or change the connection', async () => {
      for (const role of ROLES) {
        const { get, list, save, remove } = setup(role);
        const allowed = role === 'owner' || role === 'admin';
        const draft = { provider: 'anthropic' as const, apiKey: KEY };

        expect((await get()).ok).toBe(allowed);
        expect((await list(draft)).ok).toBe(allowed);
        expect((await save({ ...draft, model: 'stub-model' })).ok).toBe(allowed);
        expect((await remove()).ok).toBe(allowed);
      }
    });

    it('every role can ask', async () => {
      await setup('owner').save({ provider: 'anthropic', apiKey: KEY, model: 'stub-model' });
      for (const role of ROLES) {
        expect((await setup(role).ask([{ role: 'user', content: 'hola' }])).ok).toBe(true);
      }
    });
  });

  describe('saving', () => {
    it('seals the key, keeps only its tail and audits without it', async () => {
      const result = await setup().save({
        provider: 'anthropic',
        apiKey: KEY,
        model: 'stub-model',
      });

      expect(result.ok).toBe(true);
      expect(stored()?.apiKeyCiphertext).not.toContain(KEY);
      expect(stored()?.apiKeyHint).toBe('1234');
      if (result.ok) expect(JSON.stringify(result.value)).not.toContain(KEY);

      const audit = stores.auditEntries.at(-1) as { action: string; diff: unknown };
      expect(audit.action).toBe('ai.settings_updated');
      expect(JSON.stringify(audit)).not.toContain(KEY);
      expect(audit.diff).toMatchObject({ provider: 'anthropic', keyChanged: true });
    });

    it('refuses a key the provider rejects, and stores nothing', async () => {
      const result = await setup().save({
        provider: 'anthropic',
        apiKey: 'wrong',
        model: 'stub-model',
      });
      expect(result).toEqual({ ok: false, error: { kind: 'AiKeyRejected' } });
      expect(stored()).toBeUndefined();
    });

    it('refuses a model the key cannot use', async () => {
      const result = await setup().save({ provider: 'anthropic', apiKey: KEY, model: 'made-up' });
      expect(result).toEqual({ ok: false, error: { kind: 'AiModelUnavailable' } });
    });

    it('asks for a key when a provider needs one', async () => {
      const result = await setup().save({ provider: 'gemini', model: 'stub-model' });
      expect(result).toEqual({ ok: false, error: { kind: 'AiKeyMissing' } });
    });

    it('lets Ollama through without a key', async () => {
      const result = await setup('admin', {}).save({
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'stub-model',
      });
      expect(result.ok).toBe(true);
      expect(stored()?.apiKeyCiphertext).toBeNull();
    });

    it('does not store a key when the deployment cannot encrypt it', async () => {
      const result = await setup('owner', { acceptedKey: KEY }, testSecretBox(false)).save({
        provider: 'anthropic',
        apiKey: KEY,
        model: 'stub-model',
      });
      expect(result).toEqual({ ok: false, error: { kind: 'AiEncryptionUnavailable' } });
      expect(stored()).toBeUndefined();
    });

    it('proves the model with one token when the provider has no model listing', async () => {
      const { save, stub } = setup('owner', { acceptedKey: KEY, models: [] });
      const result = await save({
        provider: 'openai_compatible',
        baseUrl: 'https://opencode.example.com/v1',
        apiKey: KEY,
        model: 'any-model',
      });
      expect(result.ok).toBe(true);
      expect(stub.calls.some((c) => c.model === 'any-model')).toBe(true);
    });
  });

  describe('reusing the saved key', () => {
    beforeEach(async () => {
      await setup().save({
        provider: 'openai_compatible',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: KEY,
        model: 'stub-model',
      });
    });

    it('reuses it for the same provider and address when the field is left blank', async () => {
      const { list, stub } = setup();
      const result = await list({
        provider: 'openai_compatible',
        baseUrl: 'https://openrouter.ai/api/v1/',
      });
      expect(result.ok).toBe(true);
      expect(stub.calls[0]?.connection.apiKey).toBe(KEY);
    });

    it('never sends it to a different address', async () => {
      const { list, stub } = setup();
      const result = await list({
        provider: 'openai_compatible',
        baseUrl: 'https://attacker.example.com/v1',
      });
      expect(result).toEqual({ ok: false, error: { kind: 'AiKeyMissing' } });
      expect(stub.calls).toHaveLength(0);
    });

    it('records that the key did not change', async () => {
      await setup().save({
        provider: 'openai_compatible',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'stub-model',
      });
      const audit = stores.auditEntries.at(-1) as { diff: unknown };
      expect(audit.diff).toMatchObject({ keyChanged: false });
    });
  });

  describe('status and chat', () => {
    it('reports nothing configured, and who can fix it', async () => {
      expect(await setup('sales').status()).toEqual({
        ok: true,
        value: { configured: false, provider: null, model: null, canConfigure: false },
      });
      const admin = await setup('admin').status();
      expect(admin.ok && admin.value.canConfigure).toBe(true);
    });

    it('answers deterministically through Synapse before calling anyone when AI is not configured', async () => {
      const { ask, stub } = setup('viewer');
      const result = await ask([{ role: 'user', content: '¿Cómo creo un cliente?' }]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reply).toContain('Gestión de Clientes');
        expect(result.value.reply).toContain('Modo Local sin IA');
      }
      expect(stub.calls).toHaveLength(0);
    });

    it('sends the stored key, the role-aware prompt and only the recent messages', async () => {
      await setup().save({ provider: 'anthropic', apiKey: KEY, model: 'stub-model' });
      const { ask, stub } = setup('sales');
      const long = Array.from({ length: 30 }, (_, i) => ({
        role: 'user' as const,
        content: `m${i}`,
      }));

      const result = await ask(long);

      expect(result).toEqual({ ok: true, value: { reply: 'echo: m29' } });
      const call = stub.calls.at(-1);
      expect(call?.connection.apiKey).toBe(KEY);
      expect(call?.system).toContain('"Ventas"');
      expect(call?.system).not.toContain('/settings/audit');
      expect(ASSISTANT_LIMITS.maxMessages).toBeLessThan(long.length);
    });

    it('does not open a key sealed for another company', async () => {
      stores.aiSettings.set(TENANT, {
        provider: 'anthropic',
        baseUrl: null,
        apiKeyCiphertext: testSecretBox().seal(KEY, 'other-tenant'),
        apiKeyHint: '1234',
        model: 'stub-model',
        updatedAt: NOW,
      } satisfies AiSettingsRecord);

      expect(await setup('owner').ask([{ role: 'user', content: 'hola' }])).toEqual({
        ok: false,
        error: { kind: 'AiKeyMissing' },
      });
    });

    it('removes the connection and audits it', async () => {
      await setup().save({ provider: 'anthropic', apiKey: KEY, model: 'stub-model' });
      expect(await setup().remove()).toEqual({ ok: true, value: { removed: true } });
      expect(stored()).toBeUndefined();
      expect((stores.auditEntries.at(-1) as { action: string }).action).toBe('ai.settings_removed');
    });
  });

  describe('system prompt', () => {
    it('tells the model it has no company data', () => {
      expect(assistantSystemPrompt({ userId: 'u', role: 'owner' })).toContain(
        'NO tienes acceso a los datos de la empresa',
      );
    });

    it('lists every screen for the owner', () => {
      const prompt = assistantSystemPrompt({ userId: 'u', role: 'owner' });
      for (const screen of ASSISTANT_SCREENS) expect(prompt).toContain(`(${screen.path})`);
    });
  });
});
