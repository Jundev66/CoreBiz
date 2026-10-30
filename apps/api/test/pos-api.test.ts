import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  resetEnv();

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe('POS API HTTP Endpoints', () => {
  it('GET /v1/pos/catalog responds with 200 and catalog structure', async () => {
    const res = await fetch(`${baseUrl}/v1/pos/catalog?limit=50`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: unknown[]; serverTime: string };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.serverTime).toBe('string');
  });

  it('GET /v1/pos/conflicts responds with 200 and conflicts list', async () => {
    const res = await fetch(`${baseUrl}/v1/pos/conflicts`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /v1/pos/devices/enroll rejects invalid pairing code with 404', async () => {
    const res = await fetch(`${baseUrl}/v1/pos/devices/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installationId: '018e245a-0000-7000-8000-000000000099',
        name: 'Tablet Standby',
        pairingCode: 'NON_EXISTENT_CODE',
      }),
    });

    expect(res.status).toBe(404);
  });

  it('POST /v1/pos/sync handles empty or malformed batches with 400', async () => {
    const res = await fetch(`${baseUrl}/v1/pos/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev-1',
        operations: [],
      }),
    });

    expect(res.status).toBe(400);
  });
});
