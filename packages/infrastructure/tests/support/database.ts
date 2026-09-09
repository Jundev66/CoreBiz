import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { Plan, asId, type Role, type TenantId, type UserId } from '@corebiz/domain';
import type { IdGenerator, TenantContext } from '@corebiz/application';

/**
 * Andamiaje de los tests de integracion.
 *
 * Se conecta a la base de datos LOCAL de Supabase (`pnpm db:start`) como usuario
 * `postgres`, que es superusuario y por tanto se salta las politicas RLS. Eso es
 * justo lo que hace falta para preparar y comprobar el estado: si el andamiaje
 * usara las mismas politicas que esta verificando, un fallo de aislamiento
 * pasaria desapercibido porque tampoco veria los datos que deberia estar viendo.
 *
 * El codigo bajo prueba, en cambio, entra por el Unit of Work, que cambia de rol
 * a `authenticated` y queda sometido a las politicas.
 *
 * Y por la misma razon el andamiaje NO usa el ORM: escribe SQL directo sobre `postgres.js`.
 * Antes lo incumplia a medias —se conectaba como superusuario, si, pero a traves de
 * Drizzle— y eso hacia que la herramienta bajo prueba fuese tambien la que preparaba el
 * terreno. Ahora la unica dependencia del andamiaje es el driver.
 */

const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const TEST_DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_URL;

let client: postgres.Sql | undefined;

export function testSql(): postgres.Sql {
  client ??= postgres(TEST_DATABASE_URL, { max: 2, prepare: false, ssl: false });
  return client;
}

export async function closeTestDatabase(): Promise<void> {
  if (client !== undefined) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}

/**
 * Identificadores de prueba.
 *
 * En produccion son uuid v7 (ordenables por fecha); aqui basta con que sean
 * validos y unicos. Lo que si se respeta es que los genere un puerto y no una
 * llamada suelta, porque es lo que permite que un test los haga predecibles.
 */
export const testIds: IdGenerator = { next: () => randomUUID() };

export interface TestTenant {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly ctx: TenantContext;
}

/**
 * Crea un tenant aislado con su usuario y su pertenencia.
 *
 * Cada test trabaja sobre uno propio en lugar de compartir uno global: asi la
 * suite no depende del orden de ejecucion ni de limpiar entre pruebas, y ademas
 * deja el terreno preparado para verificar el aislamiento entre tenants, que es
 * imposible de comprobar si solo existe uno.
 */
export async function createTestTenant(
  options: {
    readonly role?: Role;
    readonly plan?: 'free' | 'pro';
    readonly slug?: string;
  } = {},
): Promise<TestTenant> {
  const sql = testSql();
  const tenantId = asId<TenantId>(randomUUID());
  const userId = asId<UserId>(randomUUID());
  const role: Role = options.role ?? 'owner';

  // auth.users solo exige el id; el resto lo rellena Supabase en un alta real.
  await sql`insert into auth.users (id) values (${userId})`;

  await sql`
    insert into public.tenants (
      id, slug, name, plan_code, base_currency,
      exchange_rate_scaled, exchange_rate_at, tax_label, tax_rate_bp
    )
    values (
      ${tenantId}, ${options.slug ?? `test-${tenantId.slice(0, 8)}`}, 'Comercio de prueba',
      ${options.plan ?? 'free'}, 'USD',
      ${'3650000000'}, ${new Date('2026-09-01T00:00:00.000Z')},
      'Impuesto informativo', 1600
    )
  `;

  await sql`
    insert into public.memberships (tenant_id, user_id, role, status)
    values (${tenantId}, ${userId}, ${role}, 'active')
  `;

  return {
    tenantId,
    userId,
    ctx: {
      tenantId,
      tenantSlug: options.slug ?? 'test',
      actor: { userId, role },
      plan: Plan.of(options.plan ?? 'free'),
      settings: {
        taxLabel: 'Impuesto informativo',
        taxRateBp: 1600,
        baseCurrency: 'USD',
        exchangeRateScaled: 3_650_000_000n,
        exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      isDemo: false,
    },
  };
}

/**
 * Borra el tenant y, en cascada, todo lo suyo.
 *
 * Que una sola sentencia baste es la comprobacion practica de que las cascadas y
 * las claves foraneas diferidas estan bien puestas: si no lo estuvieran, purgar
 * un sandbox en produccion fallaria igual que fallaria esto.
 */
export async function dropTestTenant(tenantId: TenantId): Promise<void> {
  await testSql()`delete from public.tenants where id = ${tenantId}`;
}
