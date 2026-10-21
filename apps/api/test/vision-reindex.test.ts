import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * The reindex endpoint through HTTP, in memory mode, against a fake embeddings provider.
 *
 * What only this level proves: that the route carries the RIGHT permission (reindex walks
 * the whole catalog, so a seller who can use the assistant must still be turned away), that
 * the embeddings gateway talks to the provider correctly, and that the memory driver mounts
 * a vector store with PARITY to Postgres — the whole semantic path works with no database.
 *
 * The unconfigured case (409 `AiNotConfigured`) is the use case's own contract and is
 * covered by `reindex-vision-embeddings.test.ts`; the assistant suite proves the 409 map.
 */

const DIMENSIONS = 4;
const MODEL = 'nomic-embed-text';
const PRODUCT_COUNT = 13;
const SUPPLIER_COUNT = 3;

let app: INestApplication;
let baseUrl: string;
let provider: Server;
const providerCalls: string[] = [];

function call(role?: string): Promise<Response> {
  return fetch(`${baseUrl}/v1/vision/embeddings/reindex`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(role !== undefined ? { 'x-corebiz-demo-role': role } : {}),
    },
  });
}

/** Un vector valido de `DIMENSIONS`; identico para todos, asi todo empata a similitud 1. */
function embedding(): number[] {
  return Array.from({ length: DIMENSIONS }, () => 1);
}

beforeAll(async () => {
  provider = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      providerCalls.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      if (req.url !== '/v1/embeddings') {
        res.statusCode = 404;
        res.end('{}');
        return;
      }
      const input = (JSON.parse(body) as { input?: unknown }).input;
      const texts = Array.isArray(input) ? input : [];
      res.end(
        JSON.stringify({
          object: 'list',
          model: MODEL,
          data: texts.map((_text, index) => ({
            object: 'embedding',
            index,
            embedding: embedding(),
          })),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;

  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  process.env.AI_ALLOW_PRIVATE_BASE_URLS = 'true';
  process.env.AI_KEY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.VISION_EMBEDDINGS_BASE_URL = providerUrl;
  process.env.VISION_EMBEDDINGS_MODEL = MODEL;
  process.env.VISION_EMBEDDINGS_DIMENSIONS = String(DIMENSIONS);
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
  delete process.env.VISION_EMBEDDINGS_BASE_URL;
  delete process.env.VISION_EMBEDDINGS_MODEL;
  delete process.env.VISION_EMBEDDINGS_DIMENSIONS;
  resetEnv();
});

describe('vision reindex over HTTP', () => {
  it('turns away every role but owner and admin', async () => {
    for (const role of ['sales', 'warehouse', 'viewer']) {
      expect((await call(role)).status).toBe(403);
    }
  });

  it('indexes the whole catalog through the embeddings gateway', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ products: PRODUCT_COUNT, suppliers: SUPPLIER_COUNT });
    expect(providerCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent: a second pass overwrites instead of duplicating', async () => {
    const body = await (await call()).json();
    expect(body).toEqual({ products: PRODUCT_COUNT, suppliers: SUPPLIER_COUNT });
    expect((await call('admin')).status).toBe(200);
  });
});
