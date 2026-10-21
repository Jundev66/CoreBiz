import { describe, expect, it } from 'vitest';
import type { VisionConnection } from '@synapse-vision/core';
import { httpVisionGateway, joinText } from './http-vision-gateway';

interface Recorded {
  url: string;
  init: RequestInit;
}

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
    gw: httpVisionGateway({
      allowPrivateBaseUrls: allowPrivate,
      fetch: fake.fn,
      resolve: publicDns,
    }),
  };
}

const anthropic: VisionConnection = {
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant',
  model: 'claude-sonnet-5',
};
const gemini: VisionConnection = {
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com',
  apiKey: 'AIza',
  model: 'gemini-3-flash',
};
const ollama: VisionConnection = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  apiKey: null,
  model: 'llama3.2-vision',
};
const compatible: VisionConnection = {
  provider: 'openai_compatible',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or',
  model: 'meta-llama/llama-3.2-90b-vision',
};

const request = {
  imageBase64: 'iVBORw0KGgo=',
  mimeType: 'image/png',
  prompt: 'Extrae los datos.',
};

const sentBody = (call: Recorded | undefined) =>
  JSON.parse(call?.init.body as string) as Record<string, unknown>;
const sentHeaders = (call: Recorded | undefined) => call?.init.headers as Record<string, string>;

describe('Anthropic', () => {
  it('sends the image as a base64 source and parses the text blocks', async () => {
    const { gw, calls } = gateway(200, {
      content: [{ type: 'text', text: '{"supplier":"Acme"}' }],
    });

    expect(await gw.extract({ connection: anthropic, ...request })).toEqual({
      ok: true,
      value: { supplier: 'Acme' },
    });
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sentHeaders(calls[0])).toMatchObject({ 'x-api-key': 'sk-ant' });
    expect(calls[0]?.init.redirect).toBe('manual');
    expect(sentBody(calls[0]).messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
          { type: 'text', text: 'Extrae los datos.' },
        ],
      },
    ]);
  });
});

describe('Gemini', () => {
  it('sends inline_data and reads the first candidate', async () => {
    const { gw, calls } = gateway(200, {
      candidates: [{ content: { parts: [{ text: '{"supplier":"Acme"}' }] } }],
    });

    expect(await gw.extract({ connection: gemini, ...request })).toEqual({
      ok: true,
      value: { supplier: 'Acme' },
    });
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    );
    expect(calls[0]?.url).not.toContain('AIza');
    expect(sentHeaders(calls[0])['x-goog-api-key']).toBe('AIza');
    const parts = (sentBody(calls[0]).contents as { parts: unknown[] }[])[0]?.parts;
    expect(parts).toEqual([
      { text: 'Extrae los datos.' },
      { inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgo=' } },
    ]);
  });
});

describe('Ollama', () => {
  it('refuses localhost unless the environment allows private addresses', async () => {
    const blocked = gateway(200, { message: { content: '{}' } });
    expect(await blocked.gw.extract({ connection: ollama, ...request })).toEqual({
      ok: false,
      error: { kind: 'AiProviderUnreachable', message: 'Base URL no permitida.' },
    });
    expect(blocked.calls).toHaveLength(0);

    const allowed = gateway(200, { message: { content: '{"supplier":"Acme"}' } }, true);
    expect(await allowed.gw.extract({ connection: ollama, ...request })).toEqual({
      ok: true,
      value: { supplier: 'Acme' },
    });
    const messages = sentBody(allowed.calls[0]).messages as {
      images: string[];
      content: string;
    }[];
    expect(messages[0]?.images).toEqual(['iVBORw0KGgo=']);
  });
});

describe('OpenAI-compatible', () => {
  it('attaches the picture as a data URL', async () => {
    const { gw, calls } = gateway(200, {
      choices: [{ message: { content: '{"supplier":"Acme"}' } }],
    });

    expect(await gw.extract({ connection: compatible, ...request })).toEqual({
      ok: true,
      value: { supplier: 'Acme' },
    });
    expect(sentHeaders(calls[0]).authorization).toBe('Bearer sk-or');
    const content = (sentBody(calls[0]).messages as { content: unknown[] }[])[0]?.content;
    expect(content).toEqual([
      { type: 'text', text: 'Extrae los datos.' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
      },
    ]);
  });
});

describe('failures', () => {
  it('maps a rejected key, a rate limit and a missing model', async () => {
    expect(await gateway(401, {}).gw.extract({ connection: anthropic, ...request })).toEqual({
      ok: false,
      error: { kind: 'AiKeyRejected' },
    });
    expect(await gateway(429, {}).gw.extract({ connection: anthropic, ...request })).toEqual({
      ok: false,
      error: { kind: 'AiRateLimited' },
    });
    expect(await gateway(404, {}).gw.extract({ connection: anthropic, ...request })).toEqual({
      ok: false,
      error: { kind: 'AiModelUnavailable' },
    });
  });

  it('never puts the provider message in the result', async () => {
    const { gw } = gateway(500, { error: { message: 'your key sk-ant is broken' } });
    expect(JSON.stringify(await gw.extract({ connection: anthropic, ...request }))).not.toContain(
      'sk-ant',
    );
  });

  it('answers not-configured when the model is missing', async () => {
    const { gw } = gateway(200, {});
    expect(await gw.extract({ connection: { ...anthropic, model: null }, ...request })).toEqual({
      ok: false,
      error: { kind: 'AiNotConfigured' },
    });
  });
});

describe('joinText', () => {
  it('drops inline reasoning, closed or cut off by the token limit', () => {
    expect(joinText([' thinkingthe user wants…</think>\n\n{"a":1}'])).toBe('{"a":1}');
    expect(joinText([' thinkingstill thinking when the budget ran out'])).toBe('');
    expect(joinText(['Sin razonamiento.', null])).toBe('Sin razonamiento.');
  });
});
