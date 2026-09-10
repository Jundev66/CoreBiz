import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getPrisma } from '@corebiz/db';
import { PrismaRateLimiter } from '../src/prisma/rate-limiter';
import { listMemberships, provisionTenant } from '../src/prisma/identity';
import { TEST_DATABASE_URL, closeTestDatabase, testSql } from './support/database';

/**
 * Lo que protege la puerta de entrada.
 *
 * El limitador y el alta de empresa son las dos piezas que se ejecutan ANTES de
 * que exista un tenant, asi que ninguna de las dos esta cubierta por la matriz de
 * aislamiento. Aqui se prueban contra Postgres de verdad, porque su correccion
 * depende enteramente de que la base de datos haga lo que se le pide: un UPSERT
 * atomico y una transaccion que revierte entera.
 */

const sql = testSql();

/** Cada test estrena bucket: reutilizarlos los haria dependientes del orden. */
const bucket = () => `test:${randomUUID()}`;

async function newUser(): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.users (id) values (${id})`;
  return id;
}

async function dropUser(id: string): Promise<void> {
  // Borra en cascada la pertenencia; el tenant se limpia aparte porque no cuelga
  // del usuario.
  await sql`
    delete from public.tenants
     where id in (select tenant_id from public.memberships where user_id = ${id})
  `;
  await sql`delete from auth.users where id = ${id}`;
}

// Al nivel del archivo y no dentro de un `describe`: colgado del primero, la
// conexion se cierra en cuanto ese bloque termina y el siguiente falla entero con
// CONNECTION_ENDED, que no dice nada del motivo real.
afterAll(closeTestDatabase);

describe('Limitador de peticiones', () => {
  const limiter = new PrismaRateLimiter(getPrisma(TEST_DATABASE_URL));

  it('deja pasar hasta el limite y bloquea a partir de ahi', async () => {
    const key = bucket();

    const first = await limiter.hit(key, 3, 60);
    expect(first).toMatchObject({ allowed: true, remaining: 2 });

    await limiter.hit(key, 3, 60);
    const third = await limiter.hit(key, 3, 60);
    expect(third).toMatchObject({ allowed: true, remaining: 0 });

    const fourth = await limiter.hit(key, 3, 60);
    expect(fourth.allowed).toBe(false);
    // `Retry-After` tiene que ser util: cero o negativo invita a reintentar ya.
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('cuenta cada bucket por separado', async () => {
    const uno = bucket();
    const otro = bucket();

    await limiter.hit(uno, 1, 60);
    expect((await limiter.hit(uno, 1, 60)).allowed).toBe(false);

    // Si los buckets se mezclaran, limitar por IP dejaria fuera a todo el mundo
    // en cuanto una sola direccion se pasara.
    expect((await limiter.hit(otro, 1, 60)).allowed).toBe(true);
  });

  it('sigue contando despues de bloquear', async () => {
    const key = bucket();
    await limiter.hit(key, 1, 60);
    await limiter.hit(key, 1, 60);
    await limiter.hit(key, 1, 60);

    const rows = await sql`select hits from security.rate_limits where bucket = ${key}`;

    // Si dejara de contar al bloquear, quien insistiera sin parar renovaria la
    // ventana en cuanto expirase: el limite seria un bache, no un muro.
    expect(Number((rows[0] as { hits: number }).hits)).toBe(3);
  });

  it('resiste veinte intentos simultaneos sin perder ninguno', async () => {
    const key = bucket();

    // La prueba de que el UPSERT es atomico. Con "leer y luego escribir", varias
    // de estas se pisarian y el contador acabaria por debajo de 20 — dejando
    // pasar intentos justo cuando el sistema esta bajo ataque, que es el unico
    // momento en el que un limitador importa.
    const decisions = await Promise.all(Array.from({ length: 20 }, () => limiter.hit(key, 5, 60)));

    expect(decisions.filter((d) => d.allowed)).toHaveLength(5);

    const rows = await sql`select hits from security.rate_limits where bucket = ${key}`;
    expect(Number((rows[0] as { hits: number }).hits)).toBe(20);
  });

  it('rechaza una configuracion sin sentido en lugar de aceptarla', async () => {
    // Un limite de cero permitiria todo o nada segun como se lea. Fallar es la
    // unica respuesta que no deja el sistema en un estado ambiguo.
    await expect(limiter.hit(bucket(), 0, 60)).rejects.toThrow();
  });
});

describe('Alta de empresa', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await newUser();
  });

  it('crea empresa, pertenencia, correlativo y contador en una sola transaccion', async () => {
    const result = await provisionTenant(TEST_DATABASE_URL, userId, {
      name: 'Panaderia Santa Rosa',
    });

    expect(result.ok).toBe(true);

    const [tenant] = await sql`
      select slug, plan_code, is_demo from public.tenants where id = ${result.tenantId!}
    `;
    expect(tenant).toMatchObject({
      slug: 'panaderia-santa-rosa',
      plan_code: 'free',
      // Una empresa real NUNCA nace marcada como demostracion: si lo hiciera,
      // quedaria servida sin sesion a cualquiera que abriese la aplicacion.
      is_demo: false,
    });

    const [membership] = await sql`
      select role, status from public.memberships
       where tenant_id = ${result.tenantId!} and user_id = ${userId}
    `;
    expect(membership).toMatchObject({ role: 'owner', status: 'active' });

    const [sequence] = await sql`
      select prefix, next_number from public.document_sequences
       where tenant_id = ${result.tenantId!} and doc_type = 'delivery_note'
    `;
    expect(sequence).toMatchObject({ prefix: 'NE' });

    // El contador arranca en 1: quien crea la empresa ya ocupa plaza. En cero, el
    // plan gratuito admitiria un usuario de mas.
    const [usage] = await sql`
      select count from public.tenant_usage
       where tenant_id = ${result.tenantId!} and resource = 'users'
    `;
    expect(Number((usage as { count: number }).count)).toBe(1);

    await dropUser(userId);
  });

  it('desambigua el slug en lugar de fallar cuando el nombre ya existe', async () => {
    const otro = await newUser();

    const first = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Bodega La Esquina' });
    const second = await provisionTenant(TEST_DATABASE_URL, otro, { name: 'Bodega La Esquina' });

    expect(first.ok && second.ok).toBe(true);

    const rows = await sql<{ slug: string }[]>`
      select slug from public.tenants where id in (${first.tenantId!}, ${second.tenantId!})
       order by slug
    `;

    // Dos negocios pueden llamarse igual. Pedirle a quien acaba de registrarse
    // que se invente otro nombre para su propia tienda seria absurdo.
    expect(rows.map((r) => r.slug)).toEqual(['bodega-la-esquina', 'bodega-la-esquina-1']);

    await dropUser(userId);
    await dropUser(otro);
  });

  it('no deja que un mismo usuario cree dos empresas', async () => {
    await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Primera Empresa' });
    const repeat = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Segunda Empresa' });

    // Es el doble envio del formulario de registro. Se distingue de un fallo real
    // para que la pantalla pueda seguir hacia dentro en vez de asustar a alguien
    // que solo pulso dos veces.
    expect(repeat).toMatchObject({ ok: false, error: 'ALREADY_OWNER' });

    const rows = await sql`
      select 1 from public.memberships where user_id = ${userId}
    `;
    expect(rows).toHaveLength(1);

    await dropUser(userId);
  });

  it('un INVITADO a la empresa de otro no puede crearse la suya', async () => {
    // Este era el agujero, y se comprobo con navegador antes de taparlo: la condicion
    // solo miraba a los `owner`, asi que alguien traido como admin —o vendedor, o
    // almacen— podia montarse su propia empresa desde dentro. A quien se trae para
    // administrar el negocio de otro se le da acceso a ESE negocio, no una via de
    // escape.
    const dueno = await newUser();
    const creada = await provisionTenant(TEST_DATABASE_URL, dueno, { name: 'Negocio Ajeno' });
    expect(creada.ok).toBe(true);

    await sql`
      insert into public.memberships (tenant_id, user_id, role, status)
      values (${creada.tenantId!}, ${userId}, 'admin', 'active')
    `;

    const intento = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Mi Propia' });

    // Y NO es `ALREADY_OWNER`: ese codigo la interfaz lo trata como el doble envio del
    // formulario y sigue hacia dentro. Colar por ahi una negativa de verdad dejaria a
    // esta persona fuera y sin explicacion.
    expect(intento).toMatchObject({ ok: false, error: 'ALREADY_MEMBER' });

    const suyas = await sql`
      select 1 from public.memberships where user_id = ${userId} and role = 'owner'
    `;
    expect(suyas).toHaveLength(0);

    await dropUser(userId);
    await dropUser(dueno);
  });

  it('la empresa nace CON tasa de cambio, si se da', async () => {
    // Sin tasa no se emite una sola nota de entrega: el caso de uso lo comprueba antes
    // de abrir la transaccion. Una empresa recien creada estaba rota hasta que alguien
    // encontraba Ajustes.
    const result = await provisionTenant(TEST_DATABASE_URL, userId, {
      name: 'Con Tasa',
      baseCurrency: 'USD',
      taxLabel: 'Impuesto al valor',
      taxRateBp: 1200,
      exchangeRateScaled: 3_650_000_000n,
    });
    expect(result.ok).toBe(true);

    const [row] = await sql<
      {
        exchange_rate_scaled: string;
        exchange_rate_at: Date;
        tax_rate_bp: number;
        tax_label: string;
      }[]
    >`
      select exchange_rate_scaled, exchange_rate_at, tax_rate_bp, tax_label
        from public.tenants where id = ${result.tenantId!}
    `;

    expect(String(row!.exchange_rate_scaled)).toBe('3650000000');
    expect(row!.tax_rate_bp).toBe(1200);
    expect(row!.tax_label).toBe('Impuesto al valor');
    // La FECHA de captura viaja con la tasa. Una tasa sin fecha se lee como la de hoy,
    // que es justo lo que deja de ser al dia siguiente.
    expect(row!.exchange_rate_at).not.toBeNull();

    await dropUser(userId);
  });

  it('sin tasa, no se inventa una fecha de captura', async () => {
    const result = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Sin Tasa' });
    expect(result.ok).toBe(true);

    const [row] = await sql<
      { exchange_rate_scaled: string | null; exchange_rate_at: Date | null }[]
    >`
      select exchange_rate_scaled, exchange_rate_at from public.tenants where id = ${result.tenantId!}
    `;

    expect(row!.exchange_rate_scaled).toBeNull();
    expect(row!.exchange_rate_at).toBeNull();

    await dropUser(userId);
  });

  it('rechaza un nombre demasiado corto sin dejar nada a medias', async () => {
    const result = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'A' });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_NAME' });

    const rows = await sql`select 1 from public.memberships where user_id = ${userId}`;
    expect(rows).toHaveLength(0);

    await dropUser(userId);
  });

  it('my_memberships() solo devuelve las empresas de quien pregunta', async () => {
    const ajeno = await newUser();
    await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Mi Negocio' });
    await provisionTenant(TEST_DATABASE_URL, ajeno, { name: 'Negocio Ajeno' });

    const mias = await listMemberships(TEST_DATABASE_URL, userId);

    // La funcion resuelve la identidad con auth.uid() y no acepta un
    // identificador como parametro: no hay forma de preguntarle por otro. Esta
    // aserción es lo que impide que un refactor le anada uno "por comodidad".
    expect(mias).toHaveLength(1);
    expect(mias[0]).toMatchObject({ name: 'Mi Negocio', role: 'owner', planCode: 'free' });

    await dropUser(userId);
    await dropUser(ajeno);
  });

  it('deja fuera de la lista al tenant caducado', async () => {
    const created = await provisionTenant(TEST_DATABASE_URL, userId, { name: 'Efimero' });

    await sql`
      update public.tenants set is_demo = true, expires_at = now() - interval '1 hour'
       where id = ${created.tenantId!}
    `;

    // Un sandbox caducado deja de existir para su dueno en el acto, sin esperar a
    // que el cron lo purgue. La purga es higiene de espacio, no la medida.
    expect(await listMemberships(TEST_DATABASE_URL, userId)).toHaveLength(0);

    await dropUser(userId);
  });
});
