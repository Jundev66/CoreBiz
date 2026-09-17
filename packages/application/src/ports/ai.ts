import type { AiProvider, Result } from '@corebiz/domain';

/**
 * Ports for the AI assistant.
 *
 * Three separate needs, three ports: where the company's choice is stored (inside the unit
 * of work, so saving it and auditing it happen together), how the key is kept unreadable at
 * rest, and how a provider is spoken to. The use cases know none of the vendors.
 */

// ─── The stored configuration ────────────────────────────────────────────────

export interface AiSettingsRecord {
  readonly provider: AiProvider;
  /** Null for providers with a fixed address. */
  readonly baseUrl: string | null;
  /** Sealed by `SecretBox`. Never leaves the API. */
  readonly apiKeyCiphertext: string | null;
  /** Last characters of the key, so a person can tell which one is saved. */
  readonly apiKeyHint: string | null;
  readonly model: string;
  readonly updatedAt: Date;
}

export interface AiSettingsRepository {
  find(): Promise<AiSettingsRecord | null>;
  save(record: AiSettingsRecord): Promise<void>;
  remove(): Promise<void>;
}

// ─── Keys at rest ────────────────────────────────────────────────────────────

/**
 * Authenticated encryption for provider keys.
 *
 * `context` is bound into the ciphertext (the tenant id): a sealed key copied into another
 * company's row does not open there.
 */
export interface SecretBox {
  /** False when the deployment has no encryption key configured. */
  readonly available: boolean;
  seal(plaintext: string, context: string): string;
  /** Null when the value was tampered with, sealed for another context or by another key. */
  open(sealed: string, context: string): string | null;
}

// ─── Talking to a provider ───────────────────────────────────────────────────

export interface AiConnection {
  readonly provider: AiProvider;
  /** The address actually called, already resolved with `effectiveBaseUrl`. */
  readonly baseUrl: string;
  readonly apiKey: string | null;
}

export interface AiModel {
  readonly id: string;
  /** What the provider calls it, when it says something friendlier than the id. */
  readonly label: string;
}

export interface AssistantMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * What can go wrong with a provider, told apart by what the person can do about it.
 *
 * These are `Result`s and not exceptions on purpose: a rejected key or a model that does not
 * exist is a configuration the admin can fix, not a breakdown to escalate.
 */
export type AiGatewayError =
  | { kind: 'AiKeyRejected' }
  | { kind: 'AiProviderUnreachable' }
  | { kind: 'AiModelUnavailable' }
  | { kind: 'AiRateLimited' }
  | { kind: 'AiBaseUrlNotAllowed' };

export interface AiGateway {
  /**
   * The models this connection may use. An EMPTY list means the provider does not offer a
   * listing (some OpenAI-compatible services), not that there are none.
   */
  listModels(connection: AiConnection): Promise<Result<readonly AiModel[], AiGatewayError>>;

  chat(
    connection: AiConnection,
    request: {
      readonly model: string;
      readonly system: string;
      readonly messages: readonly AssistantMessage[];
      readonly maxTokens: number;
    },
  ): Promise<Result<string, AiGatewayError>>;
}
