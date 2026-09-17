import {
  AI_PROVIDER_TRAITS,
  apiKeyHint,
  can,
  effectiveBaseUrl,
  err,
  ok,
  type AiProvider,
  type Result,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import type {
  AiConnection,
  AiGateway,
  AiGatewayError,
  AiModel,
  AiSettingsRecord,
  SecretBox,
} from '../../ports/ai';

/**
 * Connecting a company to an AI provider.
 *
 * The flow the screen follows, and the reason for each step:
 *
 *   1. The admin picks a provider and pastes a key (or an address, for Ollama).
 *   2. `listAiModels` asks the PROVIDER which models that key may use. The model is never
 *      typed from memory: which ones exist depends on the account behind the key.
 *   3. `saveAiSettings` checks the whole thing again against the provider before storing
 *      it. A configuration that was never proven to work would only fail later, in front of
 *      someone who is not the admin and cannot fix it.
 *
 * The key is sealed before it touches the database and is never returned: the screen only
 * ever sees its last four characters.
 */

export type AiSettingsError =
  | { kind: 'Forbidden' }
  | { kind: 'AiKeyMissing' }
  | { kind: 'AiEncryptionUnavailable' }
  | AiGatewayError;

export interface AiSettingsDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly gateway: AiGateway;
  readonly secrets: SecretBox;
}

/** What the settings screen may know. No ciphertext, no key. */
export interface AiSettingsView {
  readonly provider: AiProvider;
  readonly baseUrl: string | null;
  readonly model: string;
  readonly apiKeyHint: string | null;
  readonly updatedAt: Date;
}

export interface AiDraft {
  readonly provider: AiProvider;
  readonly baseUrl?: string | undefined;
  /** Blank means "keep the saved one", as long as the provider did not change. */
  readonly apiKey?: string | undefined;
}

export interface SaveAiSettingsInput extends AiDraft {
  readonly model: string;
}

function toView(record: AiSettingsRecord): AiSettingsView {
  return {
    provider: record.provider,
    baseUrl: record.baseUrl,
    model: record.model,
    apiKeyHint: record.apiKeyHint,
    updatedAt: record.updatedAt,
  };
}

/**
 * The connection a draft describes, borrowing the saved key when none was typed.
 *
 * A saved key is only reused for the SAME provider: sending an Anthropic key to whatever
 * address was just typed into an OpenAI-compatible form would hand it to a third party.
 * For the same reason it is not reused when the address of an OpenAI-compatible provider
 * changes.
 */
async function resolveConnection(
  deps: AiSettingsDeps,
  draft: AiDraft,
): Promise<Result<{ connection: AiConnection; typedKey: string | null }, AiSettingsError>> {
  const traits = AI_PROVIDER_TRAITS[draft.provider];
  const baseUrl = effectiveBaseUrl(draft.provider, draft.baseUrl ?? null);
  const typed = draft.apiKey?.trim() ?? '';

  if (typed !== '') {
    return ok({
      connection: { provider: draft.provider, baseUrl, apiKey: typed },
      typedKey: typed,
    });
  }

  const saved = await deps.uow.run((repos) => repos.aiSettings.find());
  const sameTarget =
    saved !== null &&
    saved.provider === draft.provider &&
    effectiveBaseUrl(saved.provider, saved.baseUrl) === baseUrl;

  if (sameTarget && saved.apiKeyCiphertext !== null) {
    const opened = deps.secrets.open(saved.apiKeyCiphertext, deps.ctx.tenantId);
    if (opened !== null) {
      return ok({
        connection: { provider: draft.provider, baseUrl, apiKey: opened },
        typedKey: null,
      });
    }
  }

  if (traits.requiresApiKey) return err({ kind: 'AiKeyMissing' });
  return ok({ connection: { provider: draft.provider, baseUrl, apiKey: null }, typedKey: null });
}

export function makeGetAiSettings(deps: AiSettingsDeps) {
  return async function getAiSettings(): Promise<Result<AiSettingsView | null, AiSettingsError>> {
    if (!can(deps.ctx.actor, 'ai:configure')) return err({ kind: 'Forbidden' });
    const record = await deps.uow.run((repos) => repos.aiSettings.find());
    return ok(record === null ? null : toView(record));
  };
}

export function makeListAiModels(deps: AiSettingsDeps) {
  return async function listAiModels(
    draft: AiDraft,
  ): Promise<Result<readonly AiModel[], AiSettingsError>> {
    if (!can(deps.ctx.actor, 'ai:configure')) return err({ kind: 'Forbidden' });

    const resolved = await resolveConnection(deps, draft);
    if (!resolved.ok) return resolved;

    return deps.gateway.listModels(resolved.value.connection);
  };
}

export function makeSaveAiSettings(deps: AiSettingsDeps) {
  return async function saveAiSettings(
    input: SaveAiSettingsInput,
  ): Promise<Result<AiSettingsView, AiSettingsError>> {
    if (!can(deps.ctx.actor, 'ai:configure')) return err({ kind: 'Forbidden' });

    const model = input.model.trim();
    if (model === '') return err({ kind: 'AiModelUnavailable' });

    const resolved = await resolveConnection(deps, input);
    if (!resolved.ok) return resolved;
    const { connection, typedKey } = resolved.value;

    // Checked BEFORE calling the provider: there is no point proving a key works if it
    // cannot be stored afterwards.
    if (connection.apiKey !== null && !deps.secrets.available) {
      return err({ kind: 'AiEncryptionUnavailable' });
    }

    // Proven against the provider, outside any transaction: a slow provider must not hold
    // a database connection open.
    const listed = await deps.gateway.listModels(connection);
    if (!listed.ok) return listed;

    if (listed.value.length > 0) {
      if (!listed.value.some((m) => m.id === model)) return err({ kind: 'AiModelUnavailable' });
    } else {
      // No listing offered: the only proof left is asking for one token with that model.
      const probe = await deps.gateway.chat(connection, {
        model,
        system: 'Reply with OK.',
        messages: [{ role: 'user', content: 'OK' }],
        maxTokens: 1,
      });
      if (!probe.ok) return probe;
    }

    const record: AiSettingsRecord = {
      provider: connection.provider,
      baseUrl: AI_PROVIDER_TRAITS[connection.provider].customBaseUrl ? connection.baseUrl : null,
      apiKeyCiphertext:
        connection.apiKey === null ? null : deps.secrets.seal(connection.apiKey, deps.ctx.tenantId),
      apiKeyHint: connection.apiKey === null ? null : apiKeyHint(connection.apiKey),
      model,
      updatedAt: deps.clock.now(),
    };

    return deps.uow.run(async (repos) => {
      await repos.aiSettings.save(record);
      await repos.audit.record({
        action: 'ai.settings_updated',
        entityType: 'tenant',
        entityId: deps.ctx.tenantId,
        // What changed and where requests now go. Never the key: an audit log is read by
        // more people, and kept longer, than the credential deserves.
        diff: {
          provider: record.provider,
          baseUrl: record.baseUrl,
          model: record.model,
          keyChanged: typedKey !== null,
        },
      });
      return ok(toView(record));
    });
  };
}

export function makeRemoveAiSettings(deps: AiSettingsDeps) {
  return async function removeAiSettings(): Promise<Result<{ removed: boolean }, AiSettingsError>> {
    if (!can(deps.ctx.actor, 'ai:configure')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const existing = await repos.aiSettings.find();
      if (existing === null) return ok({ removed: false });

      await repos.aiSettings.remove();
      await repos.audit.record({
        action: 'ai.settings_removed',
        entityType: 'tenant',
        entityId: deps.ctx.tenantId,
        diff: { provider: existing.provider, model: existing.model },
      });
      return ok({ removed: true });
    });
  };
}
