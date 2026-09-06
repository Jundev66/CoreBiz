import 'server-only';
import { uuidv7 } from 'uuidv7';
import { cookies } from 'next/headers';
import { Plan, asId, isRole, type Role, type UserId } from '@corebiz/domain';
import {
  makeCreateCustomer,
  systemClock,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import { getMemoryUnitOfWork, MEMORY_TENANT } from './memory-driver';

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

function resolveUnitOfWork(ctx: TenantContext): UnitOfWork {
  if (activeDriver() === 'memory') {
    return getMemoryUnitOfWork(ctx.tenantId);
  }
  // El adaptador de Drizzle entra aqui cuando se conecte Supabase. Hasta entonces,
  // fallar de forma explicita es mejor que arrancar con un comportamiento a medias.
  throw new Error(
    'El driver "postgres" aun no esta conectado. Usa `pnpm dev:nodb` o configura DATABASE_URL.',
  );
}

/** Cookies con las que la demo permite cambiar de rol y de plan sin reiniciar nada. */
export const DEMO_ROLE_COOKIE = 'corebiz_demo_role';
export const DEMO_PLAN_COOKIE = 'corebiz_demo_plan';

/**
 * Resuelve quien actua y con que limites.
 *
 * Cuando se conecte Supabase Auth, esta funcion validara la sesion y cargara la
 * pertenencia al tenant. Hasta entonces, en modo memoria toma el rol y el plan de dos
 * cookies, lo que resulta mas util que una variable de entorno: permite a quien visita
 * la demo cambiar de rol y comprobar EN VIVO que el RBAC bloquea de verdad, y activar
 * el plan PRO para ver el otro lado de las cuotas. Sin eso, casi nadie llegaria a ver
 * funcionando la parte del sistema que mas trabajo cuesta.
 */
async function resolveContext(): Promise<TenantContext> {
  const store = await cookies();

  const rawRole = store.get(DEMO_ROLE_COOKIE)?.value ?? 'owner';
  const role: Role = isRole(rawRole) ? rawRole : 'owner';
  const planCode = store.get(DEMO_PLAN_COOKIE)?.value === 'pro' ? 'pro' : 'free';

  return {
    tenantId: MEMORY_TENANT,
    tenantSlug: 'comercial-demo',
    actor: { userId: asId<UserId>('00000000-0000-0000-0000-000000000001'), role },
    plan: Plan.of(planCode),
    settings: {
      taxLabel: 'Impuesto informativo',
      taxRateBp: 1600,
      baseCurrency: 'USD',
      exchangeRateScaled: 3_650_000_000n,
      exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    isDemo: true,
  };
}

/**
 * Monta el contenedor para el request en curso.
 *
 * Se llama una vez por Server Action o por Server Component que necesite escribir.
 * Devolver funciones ya inyectadas —en lugar de un contenedor consultable— hace que
 * la llamada quede tipada y que no exista forma de pedir algo que no se ha montado.
 */
export async function forRequest(_tenantSlug?: string) {
  const ctx = await resolveContext();
  const uow = resolveUnitOfWork(ctx);

  const shared = {
    uow,
    ctx,
    clock: systemClock,
    ids: { next: () => uuidv7() },
  };

  return {
    ctx,
    createCustomer: makeCreateCustomer(shared),
  };
}

export type Container = Awaited<ReturnType<typeof forRequest>>;
