import {
  AI_PROVIDER_TRAITS,
  can,
  effectiveBaseUrl,
  err,
  ok,
  type AiProvider,
  type Result,
} from '@corebiz/domain';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import type { AiGateway, AiGatewayError, AssistantMessage, SecretBox } from '../../ports/ai';
import { assistantSystemPrompt } from './system-prompt';

/**
 * Asking the assistant, and knowing whether there is one.
 *
 * Stateless on purpose: the conversation lives in the browser and arrives whole with each
 * question. Nothing is stored, so there is no conversation table whose privacy — between
 * companies AND between colleagues — would have to be proven (`docs/THREAT_MODEL.md`).
 */

export const ASSISTANT_LIMITS = {
  maxMessages: 20,
  maxMessageLength: 2_000,
  maxReplyTokens: 1_024,
} as const;

export type AskAssistantError =
  { kind: 'Forbidden' } | { kind: 'AiNotConfigured' } | { kind: 'AiKeyMissing' } | AiGatewayError;

export interface AssistantDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly gateway: AiGateway;
  readonly secrets: SecretBox;
}

export interface AssistantStatus {
  readonly configured: boolean;
  readonly provider: AiProvider | null;
  readonly model: string | null;
  /** Whether this person can go and configure it, so the panel knows which guide to show. */
  readonly canConfigure: boolean;
}

export function makeAssistantStatus(deps: AssistantDeps) {
  return async function assistantStatus(): Promise<Result<AssistantStatus, AskAssistantError>> {
    if (!can(deps.ctx.actor, 'assistant:use')) return err({ kind: 'Forbidden' });

    const record = await deps.uow.run((repos) => repos.aiSettings.find());
    return ok({
      configured: record !== null,
      provider: record?.provider ?? null,
      model: record?.model ?? null,
      canConfigure: can(deps.ctx.actor, 'ai:configure'),
    });
  };
}

export function makeAskAssistant(deps: AssistantDeps) {
  return async function askAssistant(
    messages: readonly AssistantMessage[],
  ): Promise<Result<{ reply: string }, AskAssistantError>> {
    if (!can(deps.ctx.actor, 'assistant:use')) return err({ kind: 'Forbidden' });

    const record = await deps.uow.run((repos) => repos.aiSettings.find());
    if (record === null) return err({ kind: 'AiNotConfigured' });

    let apiKey: string | null = null;
    if (record.apiKeyCiphertext !== null) {
      apiKey = deps.secrets.open(record.apiKeyCiphertext, deps.ctx.tenantId);
      // Sealed with a key this deployment no longer has: an admin has to paste it again.
      if (apiKey === null) return err({ kind: 'AiKeyMissing' });
    } else if (AI_PROVIDER_TRAITS[record.provider].requiresApiKey) {
      return err({ kind: 'AiKeyMissing' });
    }

    // The last messages only: an old conversation must not grow the bill without bound.
    // And starting on a question: Anthropic refuses a conversation that opens with the
    // assistant, which is exactly what cutting it in the middle can produce.
    const recent = messages.slice(-ASSISTANT_LIMITS.maxMessages);
    const firstQuestion = recent.findIndex((m) => m.role === 'user');
    const trimmed = recent.slice(Math.max(0, firstQuestion));

    const reply = await deps.gateway.chat(
      {
        provider: record.provider,
        baseUrl: effectiveBaseUrl(record.provider, record.baseUrl),
        apiKey,
      },
      {
        model: record.model,
        system: assistantSystemPrompt(deps.ctx.actor),
        messages: trimmed,
        maxTokens: ASSISTANT_LIMITS.maxReplyTokens,
      },
    );

    return reply.ok ? ok({ reply: reply.value }) : reply;
  };
}
