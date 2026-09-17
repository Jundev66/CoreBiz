import { AI_PROVIDER_TRAITS, err, ok, type Result } from '@corebiz/domain';
import type {
  AiConnection,
  AiGateway,
  AiGatewayError,
  AiModel,
  AssistantMessage,
} from '@corebiz/application';
import { isAllowedBaseUrl, resolveWithDns, type ResolveHost } from './url-guard';

/**
 * The four providers, spoken to over plain `fetch`.
 *
 * No vendor SDKs: four SDKs would be four dependency trees in a serverless bundle for what
 * amounts to two requests each. The cost is keeping these request shapes current, which is
 * why each one is small and tested against recorded responses.
 *
 * Nothing here logs a key, a prompt or a reply. A failure is reduced to a `kind` the person
 * can act on; the provider's own message stays out of our logs and out of the screen,
 * because it sometimes echoes the key back.
 */

export interface HttpAiGatewayOptions {
  /** `AI_ALLOW_PRIVATE_BASE_URLS`: only for local development and the test suite. */
  readonly allowPrivateBaseUrls: boolean;
  readonly fetch?: typeof fetch;
  readonly resolve?: ResolveHost;
  readonly listTimeoutMs?: number;
  /** Below the Vercel function limit, so a slow model fails as a message and not as a 504. */
  readonly chatTimeoutMs?: number;
}

type ProviderResult<T> = Promise<Result<T, AiGatewayError>>;

const MAX_REPLY_CHARS = 20_000;

/** Models an OpenAI account lists that cannot hold a conversation. */
const NON_CHAT_MODEL = /(embed|tts|whisper|dall-e|moderation|transcribe|image|audio|realtime)/i;

export function httpAiGateway(options: HttpAiGatewayOptions): AiGateway {
  const doFetch = options.fetch ?? fetch;
  const resolve = options.resolve ?? resolveWithDns;
  const listTimeoutMs = options.listTimeoutMs ?? 10_000;
  const chatTimeoutMs = options.chatTimeoutMs ?? 45_000;

  /** Performs one request, or says which `kind` explains why it could not. */
  async function call(
    connection: AiConnection,
    path: string,
    init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
    timeoutMs: number,
  ): Promise<Result<{ status: number; body: unknown }, AiGatewayError>> {
    const url = `${connection.baseUrl}${path}`;

    if (
      AI_PROVIDER_TRAITS[connection.provider].customBaseUrl &&
      !(await isAllowedBaseUrl(connection.baseUrl, options.allowPrivateBaseUrls, resolve))
    ) {
      return err({ kind: 'AiBaseUrlNotAllowed' });
    }

    let res: Response;
    try {
      res = await doFetch(url, {
        method: init.method,
        headers: {
          accept: 'application/json',
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        // A redirect would send the key to an address nobody checked.
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return err({ kind: 'AiProviderUnreachable' });
    }

    const text = await res.text().catch(() => '');
    const body = parseJson(text);

    if (res.ok) return ok({ status: res.status, body });

    if (res.status === 401 || res.status === 403) return err({ kind: 'AiKeyRejected' });
    // Gemini answers an invalid key with 400 and says so in the body.
    if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(text)) {
      return err({ kind: 'AiKeyRejected' });
    }
    if (res.status === 429) return err({ kind: 'AiRateLimited' });
    return ok({ status: res.status, body });
  }

  const authHeaders = (connection: AiConnection): Record<string, string> => {
    switch (connection.provider) {
      case 'anthropic':
        return { 'x-api-key': connection.apiKey ?? '', 'anthropic-version': '2023-06-01' };
      case 'gemini':
        return { 'x-goog-api-key': connection.apiKey ?? '' };
      case 'ollama':
      case 'openai_compatible':
        return connection.apiKey === null ? {} : { authorization: `Bearer ${connection.apiKey}` };
    }
  };

  /** Anything that got here without being ok and is not a 404 is the provider's problem. */
  const failed = (status: number): AiGatewayError =>
    status === 404 ? { kind: 'AiModelUnavailable' } : { kind: 'AiProviderUnreachable' };

  return {
    async listModels(connection): ProviderResult<readonly AiModel[]> {
      const headers = authHeaders(connection);

      switch (connection.provider) {
        case 'anthropic': {
          const res = await call(
            connection,
            '/v1/models?limit=1000',
            { method: 'GET', headers },
            listTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err({ kind: 'AiProviderUnreachable' });
          return ok(
            arrayAt(res.value.body, 'data').flatMap((m) => {
              const id = stringAt(m, 'id');
              return id === null ? [] : [{ id, label: stringAt(m, 'display_name') ?? id }];
            }),
          );
        }

        case 'gemini': {
          const res = await call(
            connection,
            '/v1beta/models?pageSize=1000',
            { method: 'GET', headers },
            listTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err({ kind: 'AiProviderUnreachable' });
          return ok(
            arrayAt(res.value.body, 'models').flatMap((m) => {
              const name = stringAt(m, 'name');
              const methods = arrayAt(m, 'supportedGenerationMethods');
              if (name === null || !methods.includes('generateContent')) return [];
              const id = name.replace(/^models\//, '');
              return [{ id, label: stringAt(m, 'displayName') ?? id }];
            }),
          );
        }

        case 'ollama': {
          const res = await call(
            connection,
            '/api/tags',
            { method: 'GET', headers },
            listTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err({ kind: 'AiProviderUnreachable' });
          return ok(
            arrayAt(res.value.body, 'models').flatMap((m) => {
              const id = stringAt(m, 'name') ?? stringAt(m, 'model');
              return id === null ? [] : [{ id, label: id }];
            }),
          );
        }

        case 'openai_compatible': {
          const res = await call(connection, '/models', { method: 'GET', headers }, listTimeoutMs);
          if (!res.ok) return res;
          // No listing offered: the use case falls back to proving the typed model.
          if (res.value.status === 404 || res.value.status === 405) return ok([]);
          if (res.value.status >= 300) return err({ kind: 'AiProviderUnreachable' });
          return ok(
            arrayAt(res.value.body, 'data').flatMap((m) => {
              const id = stringAt(m, 'id');
              return id === null || NON_CHAT_MODEL.test(id) ? [] : [{ id, label: id }];
            }),
          );
        }
      }
    },

    async chat(connection, request): ProviderResult<string> {
      const headers = authHeaders(connection);
      const turns = request.messages.map((m) => ({ role: m.role, content: m.content }));

      switch (connection.provider) {
        case 'anthropic': {
          const res = await call(
            connection,
            '/v1/messages',
            {
              method: 'POST',
              headers,
              body: {
                model: request.model,
                max_tokens: request.maxTokens,
                system: request.system,
                messages: turns,
              },
            },
            chatTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err(failed(res.value.status));
          return ok(
            joinText(
              arrayAt(res.value.body, 'content').map((block) =>
                stringAt(block, 'type') === 'text' ? stringAt(block, 'text') : null,
              ),
            ),
          );
        }

        case 'gemini': {
          const res = await call(
            connection,
            `/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
            {
              method: 'POST',
              headers,
              body: {
                systemInstruction: { parts: [{ text: request.system }] },
                contents: request.messages.map(toGeminiTurn),
                generationConfig: { maxOutputTokens: request.maxTokens },
              },
            },
            chatTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err(failed(res.value.status));
          const candidate = arrayAt(res.value.body, 'candidates')[0];
          const parts = arrayAt(objectAt(candidate, 'content'), 'parts');
          return ok(joinText(parts.map((part) => stringAt(part, 'text'))));
        }

        case 'ollama': {
          const res = await call(
            connection,
            '/api/chat',
            {
              method: 'POST',
              headers,
              body: {
                model: request.model,
                stream: false,
                messages: [{ role: 'system', content: request.system }, ...turns],
                options: { num_predict: request.maxTokens },
              },
            },
            chatTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err(failed(res.value.status));
          return ok(joinText([stringAt(objectAt(res.value.body, 'message'), 'content')]));
        }

        case 'openai_compatible': {
          // OpenAI's own API refuses `max_tokens` on its newer models; most compatible
          // services still only understand `max_tokens`.
          const limit = isOpenAiItself(connection.baseUrl)
            ? { max_completion_tokens: request.maxTokens }
            : { max_tokens: request.maxTokens };
          const res = await call(
            connection,
            '/chat/completions',
            {
              method: 'POST',
              headers,
              body: {
                model: request.model,
                messages: [{ role: 'system', content: request.system }, ...turns],
                ...limit,
              },
            },
            chatTimeoutMs,
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return err(failed(res.value.status));
          const choice = arrayAt(res.value.body, 'choices')[0];
          return ok(joinText([stringAt(objectAt(choice, 'message'), 'content')]));
        }
      }
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function toGeminiTurn(message: AssistantMessage) {
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  };
}

function isOpenAiItself(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

function joinText(parts: readonly (string | null)[]): string {
  return parts
    .filter((p): p is string => p !== null)
    .join('')
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}

// Provider responses are untrusted JSON: read them without assuming their shape.

function objectAt(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function arrayAt(value: unknown, key: string): unknown[] {
  const found = objectAt(value, key);
  return Array.isArray(found) ? found : [];
}

function stringAt(value: unknown, key: string): string | null {
  const found = objectAt(value, key);
  return typeof found === 'string' ? found : null;
}
