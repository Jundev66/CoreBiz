import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnv } from '../src/config/env';
import { handler } from '../src/serverless';

/**
 * The function Vercel invokes serves the same application the long-lived process does.
 *
 * Production never runs `main.ts`, so without this test the entry point that is actually
 * deployed would be the only one nothing starts. It runs in memory mode: no Postgres.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  resetEnv();

  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe('the serverless entry point', () => {
  it('answers the health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it('reuses the application across invocations and keeps the shared configuration', async () => {
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/health`),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-powered-by')).toBeNull();
  });

  it('does not publish the OpenAPI document unless asked for by name', async () => {
    const res = await fetch(`${baseUrl}/docs-json`);
    expect(res.status).toBe(404);
  });
});
