import { AI_PROVIDER_TRAITS, isAiProvider } from '@corebiz/domain';
import type {
  VisionConnection,
  VisionError,
  VisionModelPort,
  VisionResult,
} from '@synapse-vision/core';
import { visionErr, visionOk } from '@synapse-vision/core';
import { isAllowedBaseUrl, resolveWithDns, type ResolveHost } from './url-guard';

/**
 * The same four providers as `http-ai-gateway`, spoken to with an IMAGE.
 *
 * This is the host side of Synapse Vision's `VisionModelPort`: the pure package knows how to
 * ask a model for structured data, but it refuses to know how each vendor wants the picture
 * attached. That knowledge lives here, next to the text gateway, so both stay in step.
 *
 * The provider's own message is never surfaced, only a `kind`: a vision model sometimes
 * echoes the key or the document back, and neither belongs in a log or on the screen.
 */

export interface HttpVisionGatewayOptions {
  /** `AI_ALLOW_PRIVATE_BASE_URLS`: only for local development and the test suite. */
  readonly allowPrivateBaseUrls: boolean;
  readonly fetch?: typeof fetch;
  readonly resolve?: ResolveHost;
  /** Below the Vercel function limit, so a slow model fails as a message and not as a 504. */
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
}

/** The prompt asks for JSON, so a JSON object is what should come back — fences tolerated. */
const MAX_VISION_CHARS = 100_000;

export function httpVisionGateway(options: HttpVisionGatewayOptions): VisionModelPort {
  const doFetch = options.fetch ?? fetch;
  const resolve = options.resolve ?? resolveWithDns;
  const timeoutMs = options.timeoutMs ?? 50_000;
  const maxTokens = options.maxTokens ?? 2_048;

  async function call(
    connection: VisionConnection,
    path: string,
    init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
  ): Promise<VisionResult<{ status: number; body: unknown }>> {
    const url = `${connection.baseUrl}${path}`;

    const allowPrivate =
      isAiProvider(connection.provider) &&
      AI_PROVIDER_TRAITS[connection.provider].customBaseUrl &&
      options.allowPrivateBaseUrls;

    // A custom address the operator pointed at their own server: it must still be checked,
    // unless the deployment explicitly allows private addresses (a local Ollama).
    if (
      isAiProvider(connection.provider) &&
      AI_PROVIDER_TRAITS[connection.provider].customBaseUrl &&
      !(await isAllowedBaseUrl(connection.baseUrl, allowPrivate, resolve))
    ) {
      return visionErr({ kind: 'AiProviderUnreachable', message: 'Base URL no permitida.' });
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
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return visionErr({ kind: 'AiProviderUnreachable' });
    }

    const text = await res.text().catch(() => '');
    const body = parseJsonLoose(text);

    if (res.ok) return visionOk({ status: res.status, body });
    if (res.status === 401 || res.status === 403) return visionErr({ kind: 'AiKeyRejected' });
    if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(text)) {
      return visionErr({ kind: 'AiKeyRejected' });
    }
    if (res.status === 429) return visionErr({ kind: 'AiRateLimited' });
    return visionOk({ status: res.status, body });
  }

  const authHeaders = (connection: VisionConnection): Record<string, string> => {
    switch (connection.provider) {
      case 'anthropic':
        return { 'x-api-key': connection.apiKey ?? '', 'anthropic-version': '2023-06-01' };
      case 'gemini':
        return { 'x-goog-api-key': connection.apiKey ?? '' };
      default:
        return connection.apiKey === null || connection.apiKey === ''
          ? {}
          : { authorization: `Bearer ${connection.apiKey}` };
    }
  };

  const failed = (status: number): VisionError =>
    status === 404 ? { kind: 'AiModelUnavailable' } : { kind: 'AiProviderUnreachable' };

  return {
    async extract(input): Promise<VisionResult<unknown>> {
      const { connection, prompt, imageBase64, mimeType } = input;
      const model = connection.model ?? '';

      if (!isAiProvider(connection.provider) || model === '') {
        return visionErr({ kind: 'AiNotConfigured' });
      }

      const headers = authHeaders(connection);

      switch (connection.provider) {
        case 'anthropic': {
          const res = await call(connection, '/v1/messages', {
            method: 'POST',
            headers,
            body: {
              model,
              max_tokens: maxTokens,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image',
                      source: { type: 'base64', media_type: mimeType, data: imageBase64 },
                    },
                    { type: 'text', text: prompt },
                  ],
                },
              ],
            },
          });
          if (!res.ok) return res;
          if (res.value.status >= 300) return visionErr(failed(res.value.status));
          return visionOk(
            coerceJson(
              joinText(
                arrayAt(res.value.body, 'content').map((block) =>
                  stringAt(block, 'type') === 'text' ? stringAt(block, 'text') : null,
                ),
              ),
            ),
          );
        }

        case 'gemini': {
          const res = await call(
            connection,
            `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: 'POST',
              headers,
              body: {
                contents: [
                  {
                    role: 'user',
                    parts: [
                      { text: prompt },
                      { inline_data: { mime_type: mimeType, data: imageBase64 } },
                    ],
                  },
                ],
                generationConfig: { maxOutputTokens: maxTokens },
              },
            },
          );
          if (!res.ok) return res;
          if (res.value.status >= 300) return visionErr(failed(res.value.status));
          const candidate = arrayAt(res.value.body, 'candidates')[0];
          const parts = arrayAt(objectAt(candidate, 'content'), 'parts');
          return visionOk(coerceJson(joinText(parts.map((part) => stringAt(part, 'text')))));
        }

        case 'ollama': {
          const res = await call(connection, '/api/chat', {
            method: 'POST',
            headers,
            body: {
              model,
              stream: false,
              messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
              options: { num_predict: maxTokens },
            },
          });
          if (!res.ok) return res;
          if (res.value.status >= 300) return visionErr(failed(res.value.status));
          const content = stringAt(objectAt(res.value.body, 'message'), 'content');
          return visionOk(content === null ? null : coerceJson(content));
        }

        case 'openai_compatible': {
          const limit = isOpenAiItself(connection.baseUrl)
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens };
          const res = await call(connection, '/chat/completions', {
            method: 'POST',
            headers,
            body: {
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                    },
                  ],
                },
              ],
              ...limit,
            },
          });
          if (!res.ok) return res;
          if (res.value.status >= 300) return visionErr(failed(res.value.status));
          const choice = arrayAt(res.value.body, 'choices')[0];
          return visionOk(coerceJson(stringAt(objectAt(choice, 'message'), 'content') ?? ''));
        }
      }
    },
  };
}

function parseJsonLoose(text: string): unknown {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/**
 * The model answers with JSON that may arrive wrapped in a code fence or flanked by prose.
 * The orchestrator validates the shape afterwards, so this only has to find the object; when
 * it cannot, the raw text is returned and the next step reports "invalid format".
 */
function coerceJson(text: string): unknown {
  const trimmed = text.trim().slice(0, MAX_VISION_CHARS);
  if (trimmed === '') return '';
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const parsed = parseJsonLoose(candidate.slice(start, end + 1));
    if (parsed !== null) return parsed;
  }
  return candidate;
}

function isOpenAiItself(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

/** A reply's text, minus any inline reasoning the model leaked into it. */
export function joinText(parts: readonly (string | null)[]): string {
  return parts
    .filter((p): p is string => p !== null)
    .join('')
    .replace(/ thinking[\s\S]*?(<\/think>|$)/gi, '')
    .trim()
    .slice(0, MAX_VISION_CHARS);
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
