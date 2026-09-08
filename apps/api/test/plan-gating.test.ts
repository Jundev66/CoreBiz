import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * Que el limite del PLAN se aplique en la API y no solo en la pantalla.
 *
 * Este test existe por un agujero que abrio la migracion. `reports`, `purchasing` y
 * `audit_export` son funcionalidades de pago, y sus gates vivian en el Server Component
 * de cada pagina — lo cual bastaba mientras no hubiera otra forma de llegar a esas
 * consultas. Al exponer el lado de lectura por HTTP, un plan gratuito podia pedir
 * `GET /v1/reports/sales-summary` y recibir el reporte entero.
 *
 * No era una fuga de datos: Row Level Security seguia confinando cada peticion a la
 * empresa de quien llama, y lo que se alcanzaba eran datos PROPIOS. Era una barrera de
 * monetizacion que se podia saltar, que es un fallo distinto y menos grave. Pero un
 * fallo, y de los que solo se ven ejecutando.
 *
 * Corre en modo memoria: sin Postgres, sin Supabase, en `pnpm test:unit`.
 */

let app: INestApplication;
let baseUrl: string;

/** En modo memoria no hay token; el plan se cambia con la cabecera de demostracion. */
async function status(path: string, plan?: 'pro'): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: plan === undefined ? {} : { 'x-corebiz-demo-plan': plan },
  });
  return res.status;
}

beforeAll(async () => {
  process.env.DATA_DRIVER = 'memory';
  resetEnv();

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe('el plan gratuito no alcanza lo que es de pago', () => {
  it.each([
    ['/v1/reports/sales-summary', 'reports'],
    ['/v1/purchasing/suppliers', 'purchasing'],
    ['/v1/purchasing/receipts', 'purchasing'],
    ['/v1/administration/audit/export', 'audit_export'],
  ])('%s responde 403', async (path) => {
    expect(await status(path)).toBe(403);
  });

  it('y lo dice con la clave que la interfaz sabe traducir', async () => {
    const res = await fetch(`${baseUrl}/v1/reports/sales-summary`);
    const body = (await res.json()) as {
      errorKind: string;
      errorParams: { requiredPlan?: string };
    };

    // `FeatureNotAvailable` y NO `Forbidden`. La diferencia decide si la pantalla dice
    // "sube de plan" o "no tienes permiso" — y lo segundo seria mentira, ademas de
    // perder la venta. `requiredPlan` viaja para poder nombrarlo.
    expect(body.errorKind).toBe('FeatureNotAvailable');
    expect(body.errorParams.requiredPlan).toBe('pro');
  });
});

describe('con el plan PRO si', () => {
  it.each([
    '/v1/reports/sales-summary',
    '/v1/purchasing/suppliers',
    '/v1/administration/audit/export',
  ])('%s responde 200', async (path) => {
    expect(await status(path, 'pro')).toBe(200);
  });
});

describe('lo que NO es de pago sigue abierto', () => {
  it.each([
    // El registro de auditoria PAGINADO se ve con el plan gratuito. Lo que se vende no
    // es mirarlo, es llevarselo entero de una vez.
    '/v1/administration/audit?limit=25',
    '/v1/customers',
    '/v1/products',
    '/v1/delivery-notes',
    '/v1/usage?resources=customers',
  ])('%s responde 200 con el plan gratuito', async (path) => {
    expect(await status(path)).toBe(200);
  });
});
