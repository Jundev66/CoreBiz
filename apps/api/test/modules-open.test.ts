import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/http/all-exceptions.filter';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * Todos los modulos se alcanzan por HTTP. Ninguno esta detras de un plan.
 *
 * Este archivo se llamaba `plan-gating.test.ts` y comprobaba lo contrario: que
 * `reports`, `purchasing` y `audit_export` respondieran 403 con el plan gratuito.
 * Nacio de un agujero real —los gates vivian en el Server Component de cada pagina, y
 * al exponer el lado de lectura por HTTP se podian rodear— y esa leccion sigue siendo
 * valida: **una barrera que solo esta en la pantalla no es una barrera**.
 *
 * Lo que cambio es que ya no hay nada que cobrar, asi que ya no hay barrera. El test se
 * queda, invertido, porque la comprobacion que importa sigue siendo la misma: lo que
 * decide que se puede hacer se comprueba EJECUTANDO la API, no leyendo la interfaz. Si
 * alguien reintrodujera un candado sin querer, aqui saldria como un 403.
 *
 * Corre en modo memoria: sin Postgres, sin Supabase, en `pnpm test:unit`.
 */

let app: INestApplication;
let baseUrl: string;

async function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`);
}

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

describe('lo que antes era de pago ahora esta abierto', () => {
  it.each([
    ['/v1/reports/sales-summary', 'reports'],
    ['/v1/purchasing/suppliers', 'purchasing'],
    ['/v1/purchasing/receipts', 'purchasing'],
    ['/v1/administration/audit/export', 'audit_export'],
  ])('%s responde 200', async (path) => {
    expect((await get(path)).status).toBe(200);
  });

  it('ninguna ruta contesta ya que hace falta otro plan', async () => {
    // El guard de modulos sigue montado y sigue consultando al dominio; lo que ha
    // cambiado es la respuesta. Si volviera a decir que no, seria con esta clave, asi
    // que buscarla es la forma directa de cazarlo.
    for (const path of [
      '/v1/reports/sales-summary',
      '/v1/purchasing/suppliers',
      '/v1/purchasing/receipts',
      '/v1/administration/audit/export',
    ]) {
      const res = await get(path);
      const cuerpo = await res.text();
      expect(cuerpo, path).not.toContain('FeatureNotAvailable');
    }
  });
});

describe('el resto del sistema sigue abierto', () => {
  it.each([
    '/v1/administration/audit?limit=25',
    '/v1/customers',
    '/v1/products',
    '/v1/delivery-notes',
    '/v1/usage?resources=customers',
  ])('%s responde 200', async (path) => {
    expect((await get(path)).status).toBe(200);
  });
});
