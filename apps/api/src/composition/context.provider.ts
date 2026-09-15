import { Scope, type FactoryProvider } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Plan, asId, isRole, type Role, type TenantId, type UserId } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import {
  loadSessionContext,
  type Membership,
  type SessionMembership,
} from '@corebiz/infrastructure';
import type { AuthenticatedRequest, VerifiedIdentity } from '../auth/authenticated-request';
import { ACTIVE_CONTEXT, IDENTITY, MEMBERSHIPS, SESSION_INFO, TENANT_CONTEXT } from '../tokens';
import { activeDriver, databaseUrl } from '../config/driver';
import { MEMORY_TENANT } from './memory-driver';
import { DEMO_SETTINGS, planFrom, settingsFrom } from './settings';
import { NoActiveTenantException } from '../http/api-error';

/**
 * Quien opera y con que limites, resuelto UNA VEZ POR PETICION.
 *
 * Es `resolveContext()` de apps/web/src/composition/container.ts con dos cambios y ni
 * uno mas: la identidad llega ya verificada por el middleware en lugar de leerse de
 * una cookie de Supabase, y el tenant activo llega en una cabecera en lugar de en la
 * cookie `corebiz_tenant`. Lo que NO cambia es lo unico que importa — el rol sale de
 * la PERTENENCIA leida de la base de datos, y las sobreescrituras de demostracion
 * exigen las dos condiciones a la vez.
 *
 * `Scope.REQUEST` es carga estructural, no una preferencia de estilo. Un contexto
 * compartido entre peticiones haria que `establishTenantContext` escribiese el tenant
 * EQUIVOCADO en `set_config`, y Row Level Security obedeceria sirviendo datos de una
 * empresa a otra: la politica no puede detectar que la identidad que le pasaron es
 * vieja. No falla con un error; falla sirviendo datos ajenos.
 */

/** Sesion, tal como la necesita la interfaz para pintar la cuenta activa. */
export interface SessionInfo {
  readonly email: string | null;
  readonly memberships: readonly Membership[];
  readonly isDemo: boolean;
  /** Cuando desaparece el sandbox, o null si el tenant no caduca. */
  readonly expiresAt: Date | null;
  /** True solo con `DATA_DRIVER=memory`. "No caduca" NO significa "es memoria". */
  readonly memoryDriver: boolean;
}

export interface ResolvedContext {
  readonly ctx: TenantContext;
  readonly session: SessionInfo;
}

const MEMORY_USER_ID = asId<UserId>('00000000-0000-0000-0000-000000000001');

const MEMORY_SESSION: SessionInfo = {
  email: null,
  memberships: [],
  isDemo: true,
  expiresAt: null,
  memoryDriver: true,
};

function header(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function memoryContext(role: Role): TenantContext {
  return {
    tenantId: MEMORY_TENANT,
    tenantSlug: 'comercial-demo',
    actor: { userId: MEMORY_USER_ID, role },
    plan: Plan.of('free'),
    settings: DEMO_SETTINGS,
    isDemo: true,
  };
}

export const identityProvider: FactoryProvider = {
  provide: IDENTITY,
  scope: Scope.REQUEST,
  inject: [REQUEST],
  useFactory: (req: AuthenticatedRequest): VerifiedIdentity => {
    if (req.auth === undefined) {
      // Solo puede pasar si una ruta se salta el middleware. Es un fallo de
      // configuracion, no una peticion sin credenciales: por eso revienta.
      throw new Error('La peticion llego sin identidad: falta AuthMiddleware en esta ruta.');
    }
    return req.auth;
  },
};

export const membershipsProvider: FactoryProvider = {
  provide: MEMBERSHIPS,
  scope: Scope.REQUEST,
  inject: [IDENTITY],
  /*
   * Memberships and each company's profile arrive together, in ONE transaction. The active
   * company's settings used to be read in a second one, on every call to the API.
   */
  useFactory: async (identity: VerifiedIdentity): Promise<readonly SessionMembership[]> =>
    activeDriver() === 'memory' ? [] : loadSessionContext(databaseUrl(), identity.userId),
};

export const activeContextProvider: FactoryProvider = {
  provide: ACTIVE_CONTEXT,
  scope: Scope.REQUEST,
  inject: [REQUEST, IDENTITY, MEMBERSHIPS],
  useFactory: (
    req: AuthenticatedRequest,
    identity: VerifiedIdentity,
    memberships: readonly SessionMembership[],
  ): ResolvedContext | null => {
    const rawRole = header(req, 'x-corebiz-demo-role');
    const roleOverride: Role | null = rawRole !== undefined && isRole(rawRole) ? rawRole : null;

    if (activeDriver() === 'memory') {
      return { ctx: memoryContext(roleOverride ?? 'owner'), session: MEMORY_SESSION };
    }

    // Cuenta creada pero sin empresa. Pasa cuando el alta exige confirmar el correo
    // y la primera sesion llega despues. No es un error: es un estado por el que
    // todo el mundo pasa una vez.
    if (memberships.length === 0) return null;

    /*
     * El tenant activo sale de la cabecera SOLO si esta entre los suyos. Ese filtro
     * es lo que rechaza el acceso cruzado: la lista viene de `app.my_memberships()`,
     * que resuelve la identidad con `auth.uid()` y no acepta un identificador de
     * usuario como parametro.
     */
    const requested = header(req, 'x-corebiz-tenant');
    const active = memberships.find((m) => m.tenantId === requested) ?? memberships[0];
    if (active === undefined) return null;

    const membershipRole: Role = isRole(active.role) ? active.role : 'viewer';

    /*
     * El rol sale de la PERTENENCIA. La cabecera de demostracion solo puede cambiarlo
     * bajo dos condiciones a la vez, y las dos hacen falta:
     *
     *   1. El tenant esta marcado `is_demo`. En una empresa real, jamas.
     *   2. La pertenencia es de PROPIETARIO — el rol mas alto que hay.
     *
     * La segunda es la que impide que esto sea una escalada de privilegios. Y una
     * cabecera es AUN MAS facil de escribir que la cookie que habia antes: siendo ya
     * propietario no hay nada por encima a lo que subir, asi que solo puede quitar
     * permisos, que es exactamente para lo que existe.
     */
    const role: Role =
      active.isDemo && membershipRole === 'owner' && roleOverride !== null
        ? roleOverride
        : membershipRole;

    const ctx: TenantContext = {
      tenantId: asId<TenantId>(active.tenantId),
      tenantSlug: active.slug,
      actor: { userId: asId<UserId>(identity.userId), role },
      // El codigo sigue viniendo de la empresa, pero todos apuntan al mismo plan sin
      // limites. Aqui habia ademas una cabecera de demostracion para alternar entre
      // gratuito y de pago; se fue con los planes, porque no queda nada que alternar.
      plan: Plan.of(planFrom(active.planCode)),
      // The profile came with the membership, from the same function and the same
      // transaction: there is no window in which the membership exists and the profile
      // does not.
      settings: settingsFrom(active),
      isDemo: active.isDemo,
    };

    const session: SessionInfo = {
      email: identity.email,
      memberships,
      isDemo: active.isDemo,
      expiresAt: active.expiresAt,
      memoryDriver: false,
    };

    return { ctx, session };
  },
};

export const tenantContextProvider: FactoryProvider = {
  provide: TENANT_CONTEXT,
  scope: Scope.REQUEST,
  inject: [ACTIVE_CONTEXT],
  useFactory: (resolved: ResolvedContext | null): TenantContext => {
    if (resolved === null) throw new NoActiveTenantException();
    return resolved.ctx;
  },
};

export const sessionInfoProvider: FactoryProvider = {
  provide: SESSION_INFO,
  scope: Scope.REQUEST,
  inject: [ACTIVE_CONTEXT],
  useFactory: (resolved: ResolvedContext | null): SessionInfo => {
    if (resolved === null) throw new NoActiveTenantException();
    return resolved.session;
  },
};
