import 'server-only';
import { uuidv7 } from 'uuidv7';
import { cookies } from 'next/headers';
import { Plan, asId, isRole, type Role, type TenantId, type UserId } from '@corebiz/domain';
import {
  makeCreateCustomer,
  makeCreateProduct,
  makeAdjustStock,
  makeIssueDeliveryNote,
  makeVoidDeliveryNote,
  systemClock,
  type ReadModels,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import { loadTenantProfile, postgresRuntime } from '@corebiz/infrastructure';
import { getMemoryUnitOfWork, memoryReadModels, MEMORY_TENANT } from './memory-driver';

/**
 * Composition root: el unico lugar del sistema donde se decide QUE implementacion
 * concreta cumple cada puerto.
 *
 * No hay contenedor de inyeccion, ni decoradores, ni `reflect-metadata`. Un caso de uso
 * es una funcion que cierra sobre sus dependencias, y montarlo es pasarselas. Todo lo
 * que hace un framework de inyeccion cabe en este archivo, y se puede leer entero.
 */

/**
 * Driver de datos activo.
 *
 * `memory` arranca la aplicacion completa sin Postgres ni Docker (`pnpm dev:nodb`).
 * Que eso sea posible es la prueba observable de que la arquitectura hexagonal es real:
 * si el dominio conociera la base de datos, no habria forma de sustituirla.
 */
export type DataDriver = 'postgres' | 'memory';

export function activeDriver(): DataDriver {
  return process.env.DATA_DRIVER === 'memory' ? 'memory' : 'postgres';
}

/** Cookies con las que la demo permite cambiar de rol y de plan sin reiniciar nada. */
export const DEMO_ROLE_COOKIE = 'corebiz_demo_role';
export const DEMO_PLAN_COOKIE = 'corebiz_demo_plan';

/**
 * Tenant y usuario del entorno de demostracion sobre Postgres.
 *
 * Son fijos y los siembra `supabase/seed.sql`. Cuando entre Supabase Auth (H3),
 * el identificador saldra de la sesion verificada y estas constantes se quedaran
 * solo para el sandbox publico.
 */
export const DEMO_TENANT_ID = asId<TenantId>('00000000-0000-4000-8000-000000000001');
export const DEMO_USER_ID = asId<UserId>('00000000-0000-4000-8000-000000000002');

/** El equivalente en modo memoria, donde el identificador no tiene que ser un uuid. */
const MEMORY_USER_ID = asId<UserId>('00000000-0000-0000-0000-000000000001');

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'Falta DATABASE_URL. Arranca la base de datos con `pnpm db:start` o usa `pnpm dev:nodb`.',
    );
  }
  return url;
}

/**
 * Ajustes por defecto del tenant de demostracion.
 *
 * En modo memoria son la unica fuente; sobre Postgres se usan solo como respaldo
 * si el perfil no se pudo leer, y los valores reales vienen de la fila `tenants`.
 */
const DEMO_SETTINGS = {
  taxLabel: 'Impuesto informativo',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  exchangeRateScaled: 3_650_000_000n,
  exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
} as const;

/**
 * Resuelve quien actua y con que limites.
 *
 * Cuando se conecte Supabase Auth, esta funcion validara la sesion y cargara la
 * pertenencia al tenant. Hasta entonces, en la demo toma el rol y el plan de dos
 * cookies, lo que resulta mas util que una variable de entorno: permite a quien visita
 * la demo cambiar de rol y comprobar EN VIVO que el RBAC bloquea de verdad, y activar
 * el plan PRO para ver el otro lado de las cuotas. Sin eso, casi nadie llegaria a ver
 * funcionando la parte del sistema que mas trabajo cuesta.
 */
async function resolveContext(): Promise<TenantContext> {
  const store = await cookies();

  const rawRole = store.get(DEMO_ROLE_COOKIE)?.value ?? 'owner';
  const role: Role = isRole(rawRole) ? rawRole : 'owner';
  const planOverride = store.get(DEMO_PLAN_COOKIE)?.value === 'pro' ? 'pro' : null;

  const memory = activeDriver() === 'memory';

  const ctx: TenantContext = {
    tenantId: memory ? MEMORY_TENANT : DEMO_TENANT_ID,
    tenantSlug: 'comercial-demo',
    actor: { userId: memory ? MEMORY_USER_ID : DEMO_USER_ID, role },
    plan: Plan.of(planOverride ?? 'free'),
    settings: DEMO_SETTINGS,
    isDemo: true,
  };

  if (memory) return ctx;

  // Sobre Postgres los ajustes vienen de la base de datos: cambiar la tasa o el
  // plan en una fila tiene efecto en el acto. Si el perfil no se puede leer se
  // sigue con los valores por defecto en lugar de dejar la demo caida.
  const profile = await loadTenantProfile(databaseUrl(), ctx);
  if (profile === null) return ctx;

  return {
    ...ctx,
    tenantSlug: profile.slug,
    // La cookie de la demo sigue mandando sobre el plan; sin ella, manda la fila.
    plan: Plan.of(planOverride ?? (profile.planCode === 'pro' ? 'pro' : 'free')),
    isDemo: profile.isDemo,
    settings: {
      taxLabel: profile.taxLabel,
      taxRateBp: profile.taxRateBp,
      baseCurrency: profile.baseCurrency === 'VES' ? 'VES' : 'USD',
      exchangeRateScaled: profile.exchangeRateScaled,
      exchangeRateAt: profile.exchangeRateAt,
    },
  };
}

interface Runtime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
}

function resolveRuntime(ctx: TenantContext): Runtime {
  if (activeDriver() === 'memory') {
    return {
      uow: getMemoryUnitOfWork(ctx.tenantId),
      queries: memoryReadModels(ctx.tenantId, ctx.settings.baseCurrency),
    };
  }

  return postgresRuntime({
    url: databaseUrl(),
    ctx,
    ids: { next: () => uuidv7() },
    clock: systemClock,
  });
}

/**
 * Monta el contenedor para el request en curso.
 *
 * Se llama una vez por Server Action o por Server Component que necesite datos.
 * Devolver funciones ya inyectadas —en lugar de un contenedor consultable— hace que
 * la llamada quede tipada y que no exista forma de pedir algo que no se ha montado.
 */
export async function forRequest(_tenantSlug?: string) {
  const ctx = await resolveContext();
  const runtime = resolveRuntime(ctx);

  const shared = {
    uow: runtime.uow,
    ctx,
    clock: systemClock,
    ids: { next: () => uuidv7() },
  };

  return {
    ctx,
    queries: runtime.queries,
    createCustomer: makeCreateCustomer(shared),
    createProduct: makeCreateProduct(shared),
    adjustStock: makeAdjustStock(shared),
    issueDeliveryNote: makeIssueDeliveryNote(shared),
    voidDeliveryNote: makeVoidDeliveryNote(shared),
  };
}

export type Container = Awaited<ReturnType<typeof forRequest>>;
