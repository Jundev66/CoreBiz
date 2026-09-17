import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * The assistant through HTTP, against a fake OpenAI-compatible provider on localhost.
 *
 * What only this level proves: that the permission of each route is the one intended, that
 * the key never comes back in any response, and that a configuration saved by an admin is
 * what a seller's question uses.
 */

const PROVIDER_KEY = 'sk-test-provider-key-9876';

let app: INestApplication;
let baseUrl: string;
let provider: Server;
let providerUrl: string;
const providerCalls: { path: string; auth: string | undefined; body: string }[] = [];

function call(method: string, path: string, body?: unknown, role?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(role !== undefined ? { 'x-corebiz-demo-role': role } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  provider = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      providerCalls.push({ path: req.url ?? '', auth: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization !== `Bearer ${PROVIDER_KEY}`) {
        res.statusCode = 401;
        res.end('{"error":"bad key"}');
      } else if (req.url === '/v1/models') {
        res.end(JSON.stringify({ data: [{ id: 'fake-chat' }, { id: 'fake-embedding' }] }));
      } else if (req.url === '/v1/chat/completions') {
        res.end(JSON.stringify({ choices: [{ message: { content: 'Ve a Notas de entrega.' } }] }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;

  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  process.env.AI_ALLOW_PRIVATE_BASE_URLS = 'true';
  process.env.AI_KEY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  resetEnv();

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await new Promise((resolve) => provider?.close(resolve));
  delete process.env.AI_ALLOW_PRIVATE_BASE_URLS;
  delete process.env.AI_KEY_ENCRYPTION_KEY;
  resetEnv();
});

describe('assistant over HTTP', () => {
  it('starts unconfigured and tells each role whether it can fix that', async () => {
    const owner = (await (await call('GET', '/v1/assistant/status')).json()) as Record<
      string,
      unknown
    >;
    expect(owner).toMatchObject({ configured: false, canConfigure: true });

    const seller = (await (
      await call('GET', '/v1/assistant/status', undefined, 'sales')
    ).json()) as Record<string, unknown>;
    expect(seller).toMatchObject({ configured: false, canConfigure: false });
  });

  it('answers AiNotConfigured to a question before anyone connects it', async () => {
    const res = await call('POST', '/v1/assistant/chat', {
      messages: [{ role: 'user', content: 'hola' }],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ errorKind: 'AiNotConfigured' });
  });

  it('keeps the settings routes to owner and admin', async () => {
    for (const role of ['sales', 'warehouse', 'viewer']) {
      expect((await call('GET', '/v1/ai/settings', undefined, role)).status).toBe(403);
      expect((await call('POST', '/v1/ai/models', { provider: 'ollama' }, role)).status).toBe(403);
    }
    expect((await call('GET', '/v1/ai/settings', undefined, 'admin')).status).toBe(200);
  });

  it('rejects malformed questions before calling anyone', async () => {
    const tooLong = { messages: [{ role: 'user', content: 'x'.repeat(2_001) }] };
    const endsWithAssistant = { messages: [{ role: 'assistant', content: 'hola' }] };
    const extra = { messages: [{ role: 'user', content: 'hola' }], tenantId: 'other' };

    for (const body of [tooLong, endsWithAssistant, extra]) {
      expect((await call('POST', '/v1/assistant/chat', body)).status).toBe(400);
    }
  });

  it('refuses a wrong key with its own error', async () => {
    const res = await call('POST', '/v1/ai/models', {
      provider: 'openai_compatible',
      baseUrl: providerUrl,
      apiKey: 'wrong',
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errorKind: 'AiKeyRejected' });
  });

  it('lists models, saves, and lets a seller ask — without ever returning the key', async () => {
    const draft = { provider: 'openai_compatible', baseUrl: providerUrl, apiKey: PROVIDER_KEY };

    const models = await call('POST', '/v1/ai/models', draft);
    expect(await models.json()).toEqual({ models: [{ id: 'fake-chat', label: 'fake-chat' }] });

    const saved = await call('POST', '/v1/ai/settings', { ...draft, model: 'fake-chat' });
    const savedText = await saved.text();
    expect(saved.status).toBe(200);
    expect(savedText).not.toContain(PROVIDER_KEY);
    expect(JSON.parse(savedText)).toMatchObject({
      settings: { model: 'fake-chat', apiKeyHint: '9876' },
    });

    const read = await (await call('GET', '/v1/ai/settings')).text();
    expect(read).not.toContain(PROVIDER_KEY);

    const answer = await call(
      'POST',
      '/v1/assistant/chat',
      { messages: [{ role: 'user', content: '¿Cómo emito una nota?' }] },
      'sales',
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ reply: 'Ve a Notas de entrega.' });

    const sent = providerCalls.at(-1);
    expect(sent?.auth).toBe(`Bearer ${PROVIDER_KEY}`);
    expect(sent?.body).toContain('NO tienes acceso a los datos de la empresa');

    const status = (await (
      await call('GET', '/v1/assistant/status', undefined, 'viewer')
    ).json()) as Record<string, unknown>;
    expect(status).toEqual({
      configured: true,
      provider: 'openai_compatible',
      model: 'fake-chat',
      canConfigure: false,
    });
  });

  it('disconnects', async () => {
    expect(await (await call('DELETE', '/v1/ai/settings')).json()).toEqual({ removed: true });
    const status = (await (await call('GET', '/v1/assistant/status')).json()) as Record<
      string,
      unknown
    >;
    expect(status).toMatchObject({ configured: false });
  });
});
