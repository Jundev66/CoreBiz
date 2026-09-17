import 'server-only';
import { get } from './client';

/**
 * The reads of the AI assistant.
 *
 * Outside `ReadModels` on purpose: that port describes business data the database answers,
 * and neither of these is — one is a configuration only admins may see, the other a yes/no
 * for the help panel.
 */

export type AiProviderId = 'ollama' | 'anthropic' | 'gemini' | 'openai_compatible';

export interface AiSettingsView {
  readonly provider: AiProviderId;
  readonly baseUrl: string | null;
  readonly model: string;
  readonly apiKeyHint: string | null;
  readonly updatedAt: string;
}

export interface AssistantStatusView {
  readonly configured: boolean;
  readonly provider: AiProviderId | null;
  readonly model: string | null;
  readonly canConfigure: boolean;
}

/** Wrapped, so "nothing configured" (`settings: null`) never looks like a 403 turned into null. */
export function aiSettings(): Promise<{ readonly settings: AiSettingsView | null }> {
  return get<{ settings: AiSettingsView | null }>('/v1/ai/settings');
}

export function assistantStatus(): Promise<AssistantStatusView> {
  return get<AssistantStatusView>('/v1/assistant/status');
}
