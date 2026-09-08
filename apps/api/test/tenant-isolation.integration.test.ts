import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import postgres from 'postgres';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * Que dos empresas atendidas por el MISMO proceso no se vean la una a la otra.
 *
 * Es la prueba de regresion de la migracion entera, y no es opcional.
 *
 * Antes, cada peticion de Next construia su contexto y se moria con la respuesta. La
 * API es un proceso de LARGA VIDA que atiende a todo el mundo, asi que basta con que
 * un provider deje de ser `Scope.REQUEST` —o con que alguien "optimice" cacheando el
 * runtime— para que el contexto de la primera peticion quede capturado para siempre.
 * A partir de ahi `establishTenantContext` escribe el tenant EQUIVOCADO en
 * `set_config`, y Row Level Security obedece: sirve datos de una empresa a otra. Sin
 * error, sin log y sin ninguna diferencia visible en la respuesta.
 *
 * Por eso las peticiones de aqui van ALTERNADAS y no agrupadas por usuario: agrupadas,
 * una fuga de contexto pasaria desapercibida.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const DEMO_TENANT = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '11111111-1111-4111-8111-1111111111ff';

let app: INestApplication;
let baseUrl: string;
let sql: postgres.Sql;
let anonKey: string;

let tokenDemo: string;
let tokenOther: string;
let tokenViewer: string;

async function signUp(email: string, password: string): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
  if (body.access_token === undefined || body.user?.id === undefined) {
    throw new Error(`No se pudo dar de alta a ${email}: ${JSON.stringify(body)}`);
  }
  return { token: body.access_token, userId: body.user.id };
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (body.access_token === undefined) {
    throw new Error(`No se pudo entrar como ${email}: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

interface SessionShape {
  readonly tenant: { readonly id: string; readonly slug: string } | null;
  readonly actor: { readonly role: string } | null;
  readonly planCode: string | null;
}

async function session(token: string, headers: Record<string, string> = {}): Promise<SessionShape> {
  const res = await fetch(`${baseUrl}/v1/session`, {
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as SessionShape;
}

beforeAll(async () => {
  // La clave anonima local es fija y publica: la imprime `supabase start`.
  anonKey =
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  process.env.DATA_DRIVER = 'postgres';
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.DATABASE_MAX_CONNECTIONS = '10';
  resetEnv();

  sql = postgres(DATABASE_URL, { max: 2, prepare: false });

  // Un sufijo por corrida: los correos son unicos en GoTrue y la suite tiene que
  // poder repetirse sin un reset de la base por delante.
  const suffix = Date.now().toString(36);
  const owner = await signUp(`aislamiento-owner-${suffix}@corebiz.test`, 'Aislamiento-1234567');
  const viewer = await signUp(`aislamiento-viewer-${suffix}@corebiz.test`, 'Aislamiento-1234567');

  await sql`
    insert into public.tenants (id, slug, name, plan_code, status, is_demo,
      base_currency, exchange_rate_scaled, exchange_rate_at, tax_label, tax_rate_bp)
    values (${OTHER_TENANT}, 'empresa-aislada', 'Empresa Aislada, C.A.', 'pro', 'active', false,
      'USD', 4000000000, now(), 'IVA', 1600)
    on conflict (id) do nothing`;

  await sql`
    insert into public.memberships (tenant_id, user_id, role, status)
    values (${OTHER_TENANT}, ${owner.userId}, 'owner', 'active')`;
  await sql`
    insert into public.memberships (tenant_id, user_id, role, status)
    values (${OTHER_TENANT}, ${viewer.userId}, 'viewer', 'active')`;

  tokenOther = owner.token;
  tokenViewer = viewer.token;
  tokenDemo = await signIn('demo@corebiz.local', 'corebiz-demo');

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
});

describe('aislamiento entre empresas dentro de un mismo proceso', () => {
  it('peticiones ALTERNADAS de dos cuentas devuelven cada una lo suyo', async () => {
    const primera = await session(tokenDemo);
    const segunda = await session(tokenOther);
    const tercera = await session(tokenDemo);
    const cuarta = await session(tokenOther);

    expect(primera.tenant?.id).toBe(DEMO_TENANT);
    expect(segunda.tenant?.id).toBe(OTHER_TENANT);

    // Las dos siguientes son las que atrapan la fuga: si el contexto se hubiera
    // memoizado, la tercera devolveria la empresa de la segunda peticion.
    expect(tercera.tenant?.id).toBe(DEMO_TENANT);
    expect(cuarta.tenant?.id).toBe(OTHER_TENANT);
  });

  it('pedir una empresa ajena por cabecera no la concede', async () => {
    const forzado = await session(tokenDemo, { 'x-corebiz-tenant': OTHER_TENANT });

    // No es un 403: sencillamente la cabecera se ignora, porque el tenant activo solo
    // puede salir de la lista de pertenencias de quien llama.
    expect(forzado.tenant?.id).toBe(DEMO_TENANT);
  });

  it('sin token no se sirve nada', async () => {
    const res = await fetch(`${baseUrl}/v1/session`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ errorKind: 'Unauthenticated' });
  });

  it('un token con la firma alterada se rechaza', async () => {
    const parts = tokenDemo.split('.');
    const falso = `${parts[0]}.${parts[1]}.${'A'.repeat(86)}`;
    const res = await fetch(`${baseUrl}/v1/session`, {
      headers: { authorization: `Bearer ${falso}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('las cabeceras de demostracion no escalan privilegios', () => {
  it('un viewer de una empresa real sigue siendo viewer aunque pida ser propietario', async () => {
    const honesto = await session(tokenViewer);
    const ambicioso = await session(tokenViewer, {
      'x-corebiz-demo-role': 'owner',
      'x-corebiz-demo-plan': 'pro',
    });

    expect(honesto.actor?.role).toBe('viewer');
    expect(ambicioso.actor?.role).toBe('viewer');
  });

  it('dentro del tenant de demostracion, el propietario si puede BAJARSE el rol', async () => {
    // Es para lo que existen las cabeceras: ensenar el RBAC actuando en vivo. Solo
    // pueden quitar permisos, nunca darlos, porque exigen ser ya propietario.
    const rebajado = await session(tokenDemo, { 'x-corebiz-demo-role': 'viewer' });
    expect(rebajado.actor?.role).toBe('viewer');
  });
});
