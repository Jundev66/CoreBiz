import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * La integracion externa (ConciliaBot), de punta a punta.
 *
 * Corre en modo memoria: sin Postgres, sin Supabase, en `pnpm test:unit`. Cubre las tres
 * respuestas que definen la puerta —404 sin configuracion, 401 con credencial mala, 200
 * con la buena— y comprueba que el listado y el detalle devuelven la forma que espera el
 * consumidor, `currency` incluida.
 *
 * La clave y el tenant se fijan ANTES de crear la aplicacion y `resetEnv()` limpia la
 * cache del validador: los providers se construyen al montar el arbol, asi que cambiar el
 * entorno despues no tendria efecto. Por eso hay DOS aplicaciones, una por escenario.
 */

const KEY = 'conciliabot-integration-key-0001';

async function bootApp(): Promise<{ app: INestApplication; baseUrl: string }> {
  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  resetEnv();

  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  return { app, baseUrl: await app.getUrl() };
}

function auth(key: string | null): Record<string, string> {
  return key === null ? {} : { authorization: `Bearer ${key}` };
}

describe('sin INTEGRATIONS_API_KEY configurado', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    delete process.env.INTEGRATIONS_API_KEY;
    delete process.env.INTEGRATIONS_TENANT_ID;
    ({ app, baseUrl } = await bootApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde 404: para quien no tiene la clave, la integracion no existe', async () => {
    const list = await fetch(`${baseUrl}/v1/integrations/delivery-notes`);
    expect(list.status).toBe(404);

    const one = await fetch(`${baseUrl}/v1/integrations/delivery-notes/whatever`);
    expect(one.status).toBe(404);
  });
});

describe('con INTEGRATIONS_API_KEY configurado', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.INTEGRATIONS_API_KEY = KEY;
    // En memoria se ignora (hay una sola empresa sembrada), pero el validador exige una
    // UUID valida cuando la clave esta puesta.
    process.env.INTEGRATIONS_TENANT_ID = '11111111-1111-4111-8111-111111111111';
    ({ app, baseUrl } = await bootApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde 401 cuando falta la cabecera', async () => {
    const res = await fetch(`${baseUrl}/v1/integrations/delivery-notes`);
    expect(res.status).toBe(401);
  });

  it('responde 401 cuando la clave es incorrecta', async () => {
    const res = await fetch(`${baseUrl}/v1/integrations/delivery-notes`, {
      headers: auth('clave-que-no-es'),
    });
    expect(res.status).toBe(401);
  });

  it('devuelve una pagina de notas con su moneda', async () => {
    const res = await fetch(`${baseUrl}/v1/integrations/delivery-notes?limit=3`, {
      headers: auth(KEY),
    });
    expect(res.status).toBe(200);

    const page = (await res.json()) as {
      items: readonly { id: string; number: string; currency: string; total: string }[];
      nextCursor: string | null;
    };

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(3);
    expect(page.items[0]?.currency).toBe('USD');
    expect(typeof page.items[0]?.total).toBe('string');
  });

  it('devuelve una nota por identificador', async () => {
    const list = await fetch(`${baseUrl}/v1/integrations/delivery-notes`, { headers: auth(KEY) });
    const page = (await list.json()) as { items: readonly { id: string }[] };
    const id = page.items[0]?.id;
    expect(id).toBeDefined();

    const res = await fetch(`${baseUrl}/v1/integrations/delivery-notes/${id}`, {
      headers: auth(KEY),
    });
    expect(res.status).toBe(200);

    const note = (await res.json()) as { id: string; currency: string; lines: readonly unknown[] };
    expect(note.id).toBe(id);
    expect(note.currency).toBe('USD');
    expect(Array.isArray(note.lines)).toBe(true);
  });

  it('responde 404 cuando la nota no existe', async () => {
    const res = await fetch(
      `${baseUrl}/v1/integrations/delivery-notes/00000000-0000-0000-0000-0000000n999`,
      { headers: auth(KEY) },
    );
    expect(res.status).toBe(404);
  });
});

describe('con INTEGRATIONS_REQUESTS_PER_MINUTE bajo', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.INTEGRATIONS_API_KEY = KEY;
    process.env.INTEGRATIONS_TENANT_ID = '11111111-1111-4111-8111-111111111111';
    process.env.INTEGRATIONS_REQUESTS_PER_MINUTE = '3';
    ({ app, baseUrl } = await bootApp());
  });

  afterAll(async () => {
    delete process.env.INTEGRATIONS_REQUESTS_PER_MINUTE;
    await app?.close();
  });

  it('responde 429 cuando la credencial supera su limite por minuto', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${baseUrl}/v1/integrations/delivery-notes`, { headers: auth(KEY) });
      statuses.push(res.status);
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.at(-1)).toBe(429);
  });
});
