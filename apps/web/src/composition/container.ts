import 'server-only';
import { uuidv7 } from 'uuidv7';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Plan, asId, isRole, type Role, type TenantId, type UserId } from '@corebiz/domain';
import {
  makeCreateCustomer,
  makeCreateProduct,
  makeAdjustStock,
  makeIssueDeliveryNote,
  makeVoidDeliveryNote,
  makeInviteUser,
  makeChangeMemberRole,
  makeRemoveMember,
  makeRevokeInvitation,
  makeUpdateTenantSettings,
  makeCreateSupplier,
  makeReceiveGoods,
  systemClock,
  type ReadModels,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import {
  cryptoTokenFactory,
  demoSandboxIsAlive,
  listMemberships,
  loadTenantProfile,
  postgresRuntime,
} from '@corebiz/infrastructure';
import type { Membership } from '@corebiz/infrastructure';
import { currentUser, supabaseIsConfigured, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
import { readSandboxCookie } from '@/demo/sandbox';
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
 * Tenant y usuario del entorno PUBLICO de demostracion sobre Postgres.
 *
 * Son fijos y los siembra `supabase/seed.sql`. Con sesion iniciada no se usan
 * para nada: el identificador sale de la sesion verificada y el tenant, de la
 * pertenencia. Solo entran en juego para quien llega sin cuenta, y aun asi la
 * fila tiene que estar marcada `is_demo` — ver `resolveContext()`.
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
 * Identidad de quien esta operando, ya resuelta contra la base de datos.
 *
 * Viaja junto al contenedor para que el marco de la aplicacion pueda mostrar la
 * cuenta activa y el selector de empresa sin volver a preguntar.
 */
export interface SessionInfo {
  readonly email: string | null;
  readonly memberships: readonly Membership[];
  /**
   * True cuando se opera el tenant publico de demostracion SIN sesion. La
   * interfaz lo usa para ofrecer "crear mi cuenta" en lugar de "salir".
   */
  readonly isPublicDemo: boolean;
}

interface ResolvedContext {
  readonly ctx: TenantContext;
  readonly session: SessionInfo;
}

const ANONYMOUS: SessionInfo = { email: null, memberships: [], isPublicDemo: true };

/** El acceso publico a la demostracion se puede apagar con una variable. */
function demoIsOpen(): boolean {
  return process.env.DEMO_ENABLED !== 'false';
}

/** Un plan desconocido en la fila degrada a `free`; nunca escala a `pro`. */
function planFrom(code: string): 'free' | 'pro' {
  return code === 'pro' ? 'pro' : 'free';
}

/** Contexto del tenant de demostracion, antes de leer su fila. */
function demoContext(role: Role, planOverride: 'pro' | null, memory: boolean): TenantContext {
  return {
    tenantId: memory ? MEMORY_TENANT : DEMO_TENANT_ID,
    tenantSlug: 'comercial-demo',
    actor: { userId: memory ? MEMORY_USER_ID : DEMO_USER_ID, role },
    plan: Plan.of(planOverride ?? 'free'),
    settings: DEMO_SETTINGS,
    isDemo: true,
  };
}

/**
 * Resuelve quien actua y con que limites.
 *
 * El orden importa:
 *
 *   1. Si hay SESION VERIFICADA, manda ella. El rol y el plan salen de la
 *      pertenencia y de la fila del tenant, nunca de una cookie. Las cookies de
 *      demostracion siguen existiendo, pero solo se obedecen dentro de un tenant
 *      marcado `is_demo`, donde no hay nada que proteger y si mucho que ensenar.
 *
 *   2. Sin sesion se cae al tenant PUBLICO de demostracion. Es lo que permite
 *      que el enlace del CV se abra y funcione sin registrarse, y es la unica
 *      razon de que ese tenant exista.
 *
 * La condicion de la segunda rama merece leerse dos veces: se exige que la fila
 * tenga `is_demo = true`. No basta con que el identificador coincida con la
 * constante. Si alguien apuntara `DEMO_TENANT_ID` a una empresa real —por una
 * variable mal puesta, por una semilla equivocada— la aplicacion NO la sirve sin
 * sesion: manda a la pantalla de acceso. Sin esa comprobacion, un error de
 * configuracion se convertiria en una empresa entera abierta al publico.
 */
async function resolveContext(): Promise<ResolvedContext> {
  const store = await cookies();

  const rawRole = store.get(DEMO_ROLE_COOKIE)?.value ?? 'owner';
  const cookieRole: Role = isRole(rawRole) ? rawRole : 'owner';
  const planOverride = store.get(DEMO_PLAN_COOKIE)?.value === 'pro' ? 'pro' : null;

  // Modo memoria: no hay sesiones que verificar y no hay nada que aislar.
  if (activeDriver() === 'memory') {
    return { ctx: demoContext(cookieRole, planOverride, true), session: ANONYMOUS };
  }

  const url = databaseUrl();
  const user = supabaseIsConfigured() ? await currentUser() : null;

  // ── Sesion verificada ──────────────────────────────────────────────────────
  if (user !== null) {
    const memberships = await listMemberships(url, user.id);

    // Cuenta creada pero sin empresa: pasa cuando el alta exige confirmar el
    // correo y la primera sesion llega despues. Se pregunta el nombre del
    // negocio una sola vez y se entra.
    if (memberships.length === 0) redirect('/onboarding');

    // El tenant activo sale de la cookie SOLO si esta entre los suyos. Ese
    // filtro es lo que rechaza el acceso cruzado por URL o por cookie: la lista
    // viene de `app.my_memberships()`, que resuelve la identidad con
    // `auth.uid()` y no acepta un identificador de usuario como parametro.
    const requested = store.get(ACTIVE_TENANT_COOKIE)?.value;
    const active = memberships.find((m) => m.tenantId === requested) ?? memberships[0];
    if (active === undefined) redirect('/onboarding');

    const role: Role = isRole(active.role) ? active.role : 'viewer';

    const base: TenantContext = {
      tenantId: asId<TenantId>(active.tenantId),
      tenantSlug: active.slug,
      actor: { userId: asId<UserId>(user.id), role },
      // Dentro de un tenant de demostracion la cookie puede subir el plan para
      // que se vea el otro lado de las cuotas. En una empresa real, jamas.
      plan: Plan.of(
        active.isDemo && planOverride !== null ? planOverride : planFrom(active.planCode),
      ),
      settings: DEMO_SETTINGS,
      isDemo: active.isDemo,
    };

    const session: SessionInfo = { email: user.email, memberships, isPublicDemo: false };
    const profile = await loadTenantProfile(url, base);
    if (profile === null) return { ctx: base, session };

    return {
      ctx: {
        ...base,
        settings: {
          taxLabel: profile.taxLabel,
          taxRateBp: profile.taxRateBp,
          baseCurrency: profile.baseCurrency === 'VES' ? 'VES' : 'USD',
          exchangeRateScaled: profile.exchangeRateScaled,
          exchangeRateAt: profile.exchangeRateAt,
        },
      },
      session,
    };
  }

  // ── Sin sesion: solo la demostracion publica, y solo si de verdad lo es ─────
  if (!demoIsOpen()) redirect('/login');

  /*
   * El sandbox propio de este visitante, si lo tiene.
   *
   * La cookie va FIRMADA, asi que escribir a mano el identificador de otro
   * sandbox no lleva a ninguna parte. Y se comprueba que siga VIVO: un tenant
   * caducado ya es inaccesible por `app.is_member()`, pero enterarse aqui
   * permite servir la plantilla compartida en lugar de una aplicacion vacia
   * sin explicacion.
   *
   * Sin sandbox —o con uno caducado— se cae a la plantilla. Es el modo
   * degradado: el visitante sigue viendo el sistema funcionando, que es lo
   * unico que de verdad importa de esta pantalla.
   */
  const sandbox = await readSandboxCookie();
  const tenantId =
    sandbox !== null && (await demoSandboxIsAlive(url, sandbox))
      ? asId<TenantId>(sandbox)
      : DEMO_TENANT_ID;

  const demo: TenantContext = {
    ...demoContext(cookieRole, planOverride, false),
    tenantId,
  };
  const profile = await loadTenantProfile(url, demo);

  if (profile === null || !profile.isDemo) redirect('/login');

  return {
    ctx: {
      ...demo,
      tenantSlug: profile.slug,
      plan: Plan.of(planOverride ?? planFrom(profile.planCode)),
      settings: {
        taxLabel: profile.taxLabel,
        taxRateBp: profile.taxRateBp,
        baseCurrency: profile.baseCurrency === 'VES' ? 'VES' : 'USD',
        exchangeRateScaled: profile.exchangeRateScaled,
        exchangeRateAt: profile.exchangeRateAt,
      },
    },
    session: ANONYMOUS,
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
      queries: memoryReadModels(ctx.tenantId, ctx.settings.baseCurrency, ctx.actor.userId),
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
  const { ctx, session } = await resolveContext();
  const runtime = resolveRuntime(ctx);

  const shared = {
    uow: runtime.uow,
    ctx,
    clock: systemClock,
    ids: { next: () => uuidv7() },
  };

  // Los tokens de invitacion se generan con `randomBytes`, no con Math.random:
  // un token predecible es una puerta abierta a la empresa que lo espera.
  const withTokens = { ...shared, tokens: cryptoTokenFactory() };

  return {
    ctx,
    session,
    queries: runtime.queries,
    createCustomer: makeCreateCustomer(shared),
    createProduct: makeCreateProduct(shared),
    adjustStock: makeAdjustStock(shared),
    issueDeliveryNote: makeIssueDeliveryNote(shared),
    voidDeliveryNote: makeVoidDeliveryNote(shared),

    // Administracion.
    inviteUser: makeInviteUser(withTokens),
    changeMemberRole: makeChangeMemberRole(shared),
    removeMember: makeRemoveMember(shared),
    revokeInvitation: makeRevokeInvitation(shared),
    updateTenantSettings: makeUpdateTenantSettings(shared),

    // Compras. Modulo entero gated a PRO: el gate vive en el caso de uso, no en
    // la ruta ni en el enlace del menu.
    createSupplier: makeCreateSupplier(shared),
    receiveGoods: makeReceiveGoods(shared),
  };
}

export type Container = Awaited<ReturnType<typeof forRequest>>;
