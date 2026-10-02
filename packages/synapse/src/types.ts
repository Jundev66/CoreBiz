import { z } from 'zod';

/**
 * Supported LLM Providers in Synapse.
 * Agnostic protocol-oriented design.
 */
export const SYNAPSE_PROVIDERS = ['ollama', 'anthropic', 'gemini', 'openai_compatible'] as const;
export type SynapseProvider = (typeof SYNAPSE_PROVIDERS)[number];

export function isSynapseProvider(val: string): val is SynapseProvider {
  return (SYNAPSE_PROVIDERS as readonly string[]).includes(val);
}

export interface SynapseProviderTraits {
  readonly customBaseUrl: boolean;
  readonly requiresApiKey: boolean;
  readonly defaultBaseUrl: string;
}

export const SYNAPSE_PROVIDER_TRAITS: Readonly<Record<SynapseProvider, SynapseProviderTraits>> = {
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

export const synapseMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().trim().min(1, 'Required').max(4_000, 'TooLong'),
  })
  .strict();

export type SynapseMessage = z.infer<typeof synapseMessageSchema>;

export interface SynapseModel {
  readonly id: string;
  readonly label: string;
}

export interface SynapseConnection {
  readonly provider: SynapseProvider;
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly model?: string | null;
}

export type SynapseErrorKind =
  | 'AiNotConfigured'
  | 'AiKeyMissing'
  | 'AiKeyRejected'
  | 'AiModelUnavailable'
  | 'AiBaseUrlNotAllowed'
  | 'AiProviderUnreachable'
  | 'AiRateLimited'
  | 'Forbidden'
  | 'InvalidFormat';
