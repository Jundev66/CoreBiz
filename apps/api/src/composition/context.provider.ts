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
import { MEMORY_TENANT, MEMORY_TENANT_US, getMemoryTenantSettings } from './memory-driver';
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

const MEMORY_TENANT_VE_ID = MEMORY_TENANT as string;
const MEMORY_TENANT_US_ID = MEMORY_TENANT_US as string;

const MEMORY_USER_2 = '00000000-0000-0000-0000-000000000002';
const MEMORY_USER_3 = '00000000-0000-0000-0000-000000000003';

const MEMORY_TENANT_VE_PROFILE: SessionMembership = {
  tenantId: MEMORY_TENANT_VE_ID,
  slug: 'empresa-demo-ve',
  name: 'Empresa Demo C.A.',
  role: 'owner',
  planCode: 'free',
  isDemo: true,
  status: 'active',
  taxLabel: 'RIF',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  exchangeRateScaled: 3_650_000_000n,
  exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
  fiscalCountry: 'VE',
  expiresAt: null,
};

const MEMORY_TENANT_US_PROFILE: SessionMembership = {
  tenantId: MEMORY_TENANT_US_ID,
  slug: 'demo-store-us',
  name: 'Demo Store Inc.',
  role: 'viewer',
  planCode: 'free',
  isDemo: true,
  status: 'active',
  taxLabel: 'EIN',
  taxRateBp: 700,
  baseCurrency: 'USD',
  exchangeRateScaled: 100_000_000n,
  exchangeRateAt: new Date('2026-01-01T00:00:00.000Z'),
  fiscalCountry: 'US',
  expiresAt: null,
};

function getMemoryMembershipsForUser(userId: string): readonly SessionMembership[] {
  if (userId === MEMORY_USER_2) {
    return [
      { ...MEMORY_TENANT_VE_PROFILE, role: 'sales' },
      { ...MEMORY_TENANT_US_PROFILE, role: 'admin' },
    ];
  }
  if (userId === MEMORY_USER_3) {
    return [
      { ...MEMORY_TENANT_VE_PROFILE, role: 'warehouse' },
      { ...MEMORY_TENANT_US_PROFILE, role: 'viewer' },
    ];
  }
  return [
    { ...MEMORY_TENANT_VE_PROFILE, role: 'owner' },
    { ...MEMORY_TENANT_US_PROFILE, role: 'viewer' },
  ];
}

function header(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

export const identityProvider: FactoryProvider = {
  provide: IDENTITY,
  scope: Scope.REQUEST,
  inject: [REQUEST],
  useFactory: (req: AuthenticatedRequest): VerifiedIdentity => {
    if (req.auth === undefined) {
      throw new Error('La peticion llego sin identidad: falta AuthMiddleware en esta ruta.');
    }
    return req.auth;
  },
};

export const membershipsProvider: FactoryProvider = {
  provide: MEMBERSHIPS,
  scope: Scope.REQUEST,
  inject: [IDENTITY],
  useFactory: async (identity: VerifiedIdentity): Promise<readonly SessionMembership[]> =>
    activeDriver() === 'memory'
      ? getMemoryMembershipsForUser(identity.userId)
      : loadSessionContext(databaseUrl(), identity.userId),
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
      const userMemberships = getMemoryMembershipsForUser(identity.userId);
      const requested = header(req, 'x-corebiz-tenant');
      const active =
        userMemberships.find((m) => m.tenantId === requested || m.slug === requested) ??
        userMemberships[0] ??
        MEMORY_TENANT_VE_PROFILE;

      const membershipRole: Role = isRole(active.role) ? active.role : 'viewer';
      const role = roleOverride ?? membershipRole;
      const isUs = active.tenantId === MEMORY_TENANT_US_ID;

      const baseSettings = isUs
        ? {
            taxLabel: 'Sales Tax (7.00%)',
            taxRateBp: 700,
            baseCurrency: 'USD' as const,
            exchangeRateScaled: 100_000_000n,
            exchangeRateAt: new Date('2026-01-01T00:00:00.000Z'),
            fiscalCountry: 'US' as const,
          }
        : DEMO_SETTINGS;
      const savedSettings = getMemoryTenantSettings(active.tenantId);

      const tenantContext: TenantContext = {
        tenantId: asId<TenantId>(active.tenantId),
        tenantSlug: active.slug,
        actor: { userId: asId<UserId>(identity.userId), role },
        plan: Plan.of('free'),
        settings: savedSettings ? { ...baseSettings, ...savedSettings } : baseSettings,
        isDemo: true,
      };

      const session: SessionInfo = {
        email:
          identity.email ??
          (identity.userId === MEMORY_USER_2
            ? 'cajero@corebiz.local'
            : identity.userId === MEMORY_USER_3
              ? 'almacen@corebiz.local'
              : 'demo@corebiz.local'),
        memberships: userMemberships,
        isDemo: true,
        expiresAt: null,
        memoryDriver: true,
      };

      return { ctx: tenantContext, session };
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
