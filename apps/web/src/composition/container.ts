import 'server-only';
import { uuidv7 } from 'uuidv7';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Plan, asId, isRole, type Role, type TenantId, type UserId } from '@corebiz/domain';
import {
  makeCreateCustomer,
  makeSetCustomerStatus,
  makeCreateProduct,
  makeAdjustStock,
  makeSetProductStatus,
  makeIssueDeliveryNote,
  makeVoidDeliveryNote,
  makeInviteUser,
  makeChangeMemberRole,
  makeRemoveMember,
  makeRevokeInvitation,
  makeUpdateTenantSettings,
  makeCreateSupplier,
  makeSetSupplierStatus,
  makeReceiveGoods,
  systemClock,
  type ReadModels,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import {
  cryptoTokenFactory,
  listMemberships,
  loadTenantProfile,
  postgresRuntime,
} from '@corebiz/infrastructure';
import type { Membership } from '@corebiz/infrastructure';
import { currentUser, supabaseIsConfigured, ACTIVE_TENANT_COOKIE } from '@/auth/supabase';
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
 * La PLANTILLA de demostracion sobre Postgres, la que se clona.
 *
 * Es fija y la siembra `supabase/seed.sql`. Nadie opera este tenant: cada
 * visitante recibe una COPIA suya con su propia cuenta. Solo se usa como origen
 * en `/demo`, y `app.clone_demo_tenant()` se niega a copiarlo si la fila no
 * esta marcada `is_demo` — sin esa guarda, un identificador mal puesto serviria
 * la empresa de un cliente real a un desconocido.
 */
export const DEMO_TENANT_ID = asId<TenantId>('00000000-0000-4000-8000-000000000001');

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
   * True mientras se opera un tenant de demostracion. La interfaz lo usa para
   * pintar el aviso de caducidad y ofrecer "crear mi cuenta" junto a "salir":
   * quien esta probando el sistema necesita las dos cosas.
   */
  readonly isDemo: boolean;
  /**
   * Cuando desaparece el sandbox, o null si el tenant no caduca.
   *
   * Viaja hasta la interfaz porque el aviso tiene que dar la HORA CONCRETA y no
   * "en 24 horas": quien entra a las once de la noche merece saber que es
   * manana a las once, no calcularlo.
   */
  readonly expiresAt: Date | null;
  /**
   * True solo con `DATA_DRIVER=memory`.
   *
   * Hace falta porque "no caduca" NO significa "es el modo memoria": la plantilla de
   * demostracion sobre Postgres tampoco caduca, y durante un rato el aviso le decia
   * a quien estaba operando contra la base de datos que estaba corriendo sin ella.
   */
  readonly memoryDriver: boolean;
}

interface ResolvedContext {
  readonly ctx: TenantContext;
  readonly session: SessionInfo;
}

/** Sesion del modo memoria, donde no hay identidad que verificar. */
const MEMORY_SESSION: SessionInfo = {
  email: null,
  memberships: [],
  isDemo: true,
  expiresAt: null,
  memoryDriver: true,
};

/** Un plan desconocido en la fila degrada a `free`; nunca escala a `pro`. */
function planFrom(code: string): 'free' | 'pro' {
  return code === 'pro' ? 'pro' : 'free';
}

/** Contexto del modo memoria, donde no hay fila que leer ni sesion que verificar. */
function memoryContext(role: Role, planOverride: 'pro' | null): TenantContext {
  return {
    tenantId: MEMORY_TENANT,
    tenantSlug: 'comercial-demo',
    actor: { userId: MEMORY_USER_ID, role },
    plan: Plan.of(planOverride ?? 'free'),
    settings: DEMO_SETTINGS,
    isDemo: true,
  };
}

/**
 * Resuelve quien actua y con que limites.
 *
 * SIEMPRE a partir de una sesion verificada. No hay rama anonima, y su ausencia
 * es lo mejor de este archivo.
 *
 * La habia: quien llegaba sin cuenta operaba el tenant publico de demostracion,
 * y una cookie firmada decia cual era su sandbox. Funcionaba y estaba defendida
 * —se comprobaba `is_demo` en la fila, no solo el identificador— pero era una
 * rama que decidia a que empresa entra alguien SIN haber verificado quien es.
 * Ese tipo de codigo no falla de forma visible: falla sirviendo datos ajenos.
 *
 * Ahora el visitante de la demostracion recibe credenciales propias en `/demo` y
 * entra por la misma puerta que todo el mundo. El rol sale de la pertenencia y
 * el plan de la fila del tenant, nunca de una cookie. Las cookies de
 * demostracion siguen existiendo para cambiar de rol y de plan en vivo, y solo
 * se obedecen dentro de un tenant marcado `is_demo`, donde no hay nada que
 * proteger y si mucho que ensenar.
 */
async function resolveContext(): Promise<ResolvedContext> {
  const store = await cookies();

  const rawRole = store.get(DEMO_ROLE_COOKIE)?.value;
  const roleOverride: Role | null = rawRole !== undefined && isRole(rawRole) ? rawRole : null;
  const planOverride = store.get(DEMO_PLAN_COOKIE)?.value === 'pro' ? 'pro' : null;

  // Modo memoria: no hay sesiones que verificar y no hay nada que aislar.
  if (activeDriver() === 'memory') {
    return { ctx: memoryContext(roleOverride ?? 'owner', planOverride), session: MEMORY_SESSION };
  }

  const url = databaseUrl();
  const user = supabaseIsConfigured() ? await currentUser() : null;

  // Sin sesion no se sirve nada. Quien quiera ver el sistema sin registrarse
  // tiene `/demo`, que le da una cuenta de verdad; lo que no hay es una forma de
  // entrar sin ser nadie.
  if (user === null) redirect('/login');

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

  const membershipRole: Role = isRole(active.role) ? active.role : 'viewer';

  /*
   * El rol sale de la PERTENENCIA. La cookie de demostracion solo puede
   * cambiarlo bajo dos condiciones a la vez, y las dos hacen falta:
   *
   *   1. El tenant esta marcado `is_demo`. En una empresa real, jamas.
   *   2. La pertenencia es de PROPIETARIO — el rol mas alto que hay.
   *
   * La segunda es la que impide que esto sea una escalada de privilegios. En
   * modo degradado, cuando ya no cabe otra copia de la base, el visitante entra
   * como `viewer` sobre la plantilla COMPARTIDA: sin esa condicion le bastaria
   * escribir una cookie para pasar a propietario y escribir en el tenant que
   * todos los demas van a clonar. Siendo ya propietario no hay nada por encima a
   * lo que subir, asi que la cookie solo puede quitar permisos — que es
   * exactamente para lo que existe: ensenar el RBAC actuando en vivo.
   */
  const role: Role =
    active.isDemo && membershipRole === 'owner' && roleOverride !== null
      ? roleOverride
      : membershipRole;

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

  const profile = await loadTenantProfile(url, base);

  const session: SessionInfo = {
    email: user.email,
    memberships,
    isDemo: active.isDemo,
    expiresAt: profile?.expiresAt ?? null,
    memoryDriver: false,
  };

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
    setCustomerStatus: makeSetCustomerStatus(shared),
    createProduct: makeCreateProduct(shared),
    adjustStock: makeAdjustStock(shared),
    setProductStatus: makeSetProductStatus(shared),
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
    setSupplierStatus: makeSetSupplierStatus(shared),
    receiveGoods: makeReceiveGoods(shared),
  };
}

export type Container = Awaited<ReturnType<typeof forRequest>>;
