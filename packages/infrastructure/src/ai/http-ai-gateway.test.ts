import { describe, expect, it } from 'vitest';
import type { AiConnection } from '@corebiz/application';
import { httpAiGateway, joinText } from './http-ai-gateway';
import { isAllowedBaseUrl } from './url-guard';

interface Recorded {
  url: string;
  init: RequestInit;
}

/** A `fetch` that answers from a table and records what it was asked. */
function fakeFetch(status: number, body: unknown) {
  const calls: Recorded[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const publicDns = () => Promise.resolve(['104.18.0.1']);

function gateway(status: number, body: unknown, allowPrivate = false) {
  const fake = fakeFetch(status, body);
  return {
    calls: fake.calls,
    gw: httpAiGateway({ allowPrivateBaseUrls: allowPrivate, fetch: fake.fn, resolve: publicDns }),
  };
}

const anthropic: AiConnection = {
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant',
};
const gemini: AiConnection = {
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com',
  apiKey: 'AIza',
};
const ollama: AiConnection = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  apiKey: null,
};
const compatible: AiConnection = {
  provider: 'openai_compatible',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or',
};

const chatRequest = {
  model: 'm',
  system: 'sys',
  messages: [
    { role: 'user' as const, content: 'hola' },
    { role: 'assistant' as const, content: 'hola, ¿en qué te ayudo?' },
    { role: 'user' as const, content: '¿cómo emito una nota?' },
  ],
  maxTokens: 100,
};

const sentBody = (call: Recorded | undefined) =>
  JSON.parse(call?.init.body as string) as Record<string, unknown>;
const sentHeaders = (call: Recorded | undefined) => call?.init.headers as Record<string, string>;

describe('Anthropic', () => {
  it('lists models with its own headers', async () => {
    const { gw, calls } = gateway(200, {
      data: [{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }],
    });

    expect(await gw.listModels(anthropic)).toEqual({
      ok: true,
      value: [{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }],
    });
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/models?limit=1000');
    expect(sentHeaders(calls[0])).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
    });
    expect(calls[0]?.init.redirect).toBe('manual');
  });

  it('sends the system prompt apart and joins the text blocks', async () => {
    const { gw, calls } = gateway(200, {
      content: [
        { type: 'text', text: 'Ve a ' },
        { type: 'text', text: 'Notas de entrega.' },
      ],
    });

    expect(await gw.chat(anthropic, chatRequest)).toEqual({
      ok: true,
      value: 'Ve a Notas de entrega.',
    });
    expect(sentBody(calls[0])).toMatchObject({ system: 'sys', max_tokens: 100, model: 'm' });
    expect((sentBody(calls[0]).messages as unknown[]).length).toBe(3);
  });
});

describe('Gemini', () => {
  it('keeps only models that can generate content, without the prefix', async () => {
    const { gw } = gateway(200, {
      models: [
        {
          name: 'models/gemini-3-flash',
          displayName: 'Gemini 3 Flash',
          supportedGenerationMethods: ['generateContent'],
        },
        { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
      ],
    });

    expect(await gw.listModels(gemini)).toEqual({
      ok: true,
      value: [{ id: 'gemini-3-flash', label: 'Gemini 3 Flash' }],
    });
  });

  it('maps the assistant role to "model" and reads the first candidate', async () => {
    const { gw, calls } = gateway(200, {
      candidates: [{ content: { parts: [{ text: 'Respuesta' }] } }],
    });

    expect(await gw.chat(gemini, chatRequest)).toEqual({ ok: true, value: 'Respuesta' });
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/m:generateContent',
    );
    const body = sentBody(calls[0]);
    expect((body.contents as { role: string }[]).map((c) => c.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
  });

  it('treats its 400 for a bad key as a rejected key', async () => {
    const { gw } = gateway(400, {
      error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] },
    });
    expect(await gw.listModels(gemini)).toEqual({ ok: false, error: { kind: 'AiKeyRejected' } });
  });
});

describe('Ollama', () => {
  it('refuses localhost unless the environment allows private addresses', async () => {
    const blocked = gateway(200, { models: [] });
    expect(await blocked.gw.listModels(ollama)).toEqual({
      ok: false,
      error: { kind: 'AiBaseUrlNotAllowed' },
    });
    expect(blocked.calls).toHaveLength(0);

    const allowed = gateway(200, { models: [{ name: 'llama3.2:latest' }] }, true);
    expect(await allowed.gw.listModels(ollama)).toEqual({
      ok: true,
      value: [{ id: 'llama3.2:latest', label: 'llama3.2:latest' }],
    });
  });

  it('chats without streaming and with the system message first', async () => {
    const { gw, calls } = gateway(200, { message: { role: 'assistant', content: 'Listo' } }, true);

    expect(await gw.chat(ollama, chatRequest)).toEqual({ ok: true, value: 'Listo' });
    const body = sentBody(calls[0]);
    expect(body.stream).toBe(false);
    expect((body.messages as { role: string }[])[0]).toEqual({ role: 'system', content: 'sys' });
    expect(sentHeaders(calls[0]).authorization).toBeUndefined();
  });
});

describe('OpenAI-compatible', () => {
  it('lists chat models and leaves out embeddings and audio', async () => {
    const { gw, calls } = gateway(200, {
      data: [
        { id: 'anthropic/claude-sonnet-5' },
        { id: 'text-embedding-3-small' },
        { id: 'whisper-1' },
      ],
    });

    expect(await gw.listModels(compatible)).toEqual({
      ok: true,
      value: [{ id: 'anthropic/claude-sonnet-5', label: 'anthropic/claude-sonnet-5' }],
    });
    expect(sentHeaders(calls[0]).authorization).toBe('Bearer sk-or');
  });

  it('answers an empty list when the service offers no listing', async () => {
    const { gw } = gateway(404, 'not found');
    expect(await gw.listModels(compatible)).toEqual({ ok: true, value: [] });
  });

  it('uses max_completion_tokens only against OpenAI itself', async () => {
    const other = gateway(200, { choices: [{ message: { content: 'ok' } }] });
    await other.gw.chat(compatible, chatRequest);
    expect(sentBody(other.calls[0])).toHaveProperty('max_tokens', 100);

    const openai = gateway(200, { choices: [{ message: { content: 'ok' } }] });
    await openai.gw.chat({ ...compatible, baseUrl: 'https://api.openai.com/v1' }, chatRequest);
    expect(sentBody(openai.calls[0])).toHaveProperty('max_completion_tokens', 100);
  });
});

describe('failures', () => {
  it.each([
    [401, 'AiKeyRejected'],
    [403, 'AiKeyRejected'],
    [429, 'AiRateLimited'],
    [404, 'AiModelUnavailable'],
    [500, 'AiProviderUnreachable'],
    [302, 'AiProviderUnreachable'],
  ])('a chat answered with %i is %s', async (status, kind) => {
    const { gw } = gateway(status, { error: 'x' });
    expect(await gw.chat(anthropic, chatRequest)).toEqual({ ok: false, error: { kind } });
  });

  it('a network failure is unreachable', async () => {
    const gw = httpAiGateway({
      allowPrivateBaseUrls: false,
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(await gw.listModels(anthropic)).toEqual({
      ok: false,
      error: { kind: 'AiProviderUnreachable' },
    });
  });

  it('never puts the provider message in the result', async () => {
    const { gw } = gateway(500, { error: { message: 'your key sk-ant is broken' } });
    expect(JSON.stringify(await gw.chat(anthropic, chatRequest))).not.toContain('sk-ant');
  });
});

describe('isAllowedBaseUrl', () => {
  it('refuses a public name that resolves to a private address', async () => {
    const resolveToPrivate = () => Promise.resolve(['10.0.0.7']);
    expect(await isAllowedBaseUrl('https://ollama.example.com', false, resolveToPrivate)).toBe(
      false,
    );
  });

  it('refuses a name that does not resolve', async () => {
    const fails = () => Promise.reject(new Error('ENOTFOUND'));
    expect(await isAllowedBaseUrl('https://nowhere.example.com', false, fails)).toBe(false);
  });

  it('accepts a public name that resolves publicly', async () => {
    expect(await isAllowedBaseUrl('https://openrouter.ai/api/v1', false, publicDns)).toBe(true);
  });
});

describe('joinText', () => {
  it('drops inline reasoning, closed or cut off by the token limit', () => {
    expect(joinText(['<think>the user wants…</think>\n\nVe a Notas de entrega.'])).toBe(
      'Ve a Notas de entrega.',
    );
    expect(joinText(['<think>still thinking when the budget ran out'])).toBe('');
    expect(joinText(['Sin razonamiento.', null])).toBe('Sin razonamiento.');
  });
});
