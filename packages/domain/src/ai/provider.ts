/**
 * The AI providers a company can connect, and what each one needs.
 *
 * Four and not one per vendor: `openai_compatible` is a protocol, not a company. OpenAI,
 * OpenRouter, OpenCode Zen, Groq and LM Studio all speak it, so one entry with a base URL
 * covers them without the product having to chase every new service.
 *
 * The model is NOT part of the provider. A key authenticates an account, and which models
 * that account can use is something only the provider knows — so the model is chosen from
 * the list the provider returns for that key, never typed from memory.
 */

export const AI_PROVIDERS = ['ollama', 'anthropic', 'gemini', 'openai_compatible'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

export interface AiProviderTraits {
  /** Whether the person chooses the address. Anthropic and Gemini have a fixed one. */
  readonly customBaseUrl: boolean;
  /** Whether a key is mandatory. Ollama runs without one unless it sits behind a proxy. */
  readonly requiresApiKey: boolean;
  /** The fixed address, or the one pre-filled for providers with a custom one. */
  readonly defaultBaseUrl: string;
}

export const AI_PROVIDER_TRAITS: Readonly<Record<AiProvider, AiProviderTraits>> = {
  ollama: { customBaseUrl: true, requiresApiKey: false, defaultBaseUrl: 'http://localhost:11434' },
  anthropic: {
    customBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com',
  },
  gemini: {
    customBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  },
  openai_compatible: {
    customBaseUrl: true,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
};

/** The address actually used: the fixed one, or the one the person wrote. */
export function effectiveBaseUrl(provider: AiProvider, baseUrl: string | null): string {
  const traits = AI_PROVIDER_TRAITS[provider];
  if (!traits.customBaseUrl || baseUrl === null || baseUrl.trim() === '') {
    return traits.defaultBaseUrl;
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

/** Only the tail of a key is ever shown again, so the person can tell which one is saved. */
export function apiKeyHint(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
