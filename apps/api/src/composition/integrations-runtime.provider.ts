import { Scope, type FactoryProvider } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { systemClock, type TenantContext } from '@corebiz/application';
import { postgresRuntime } from '@corebiz/infrastructure';
import { Plan, asId, type TenantId, type UserId } from '@corebiz/domain';
import { INTEGRATIONS_RUNTIME } from '../tokens';
import { activeDriver, databaseUrl } from '../config/driver';
import { loadEnv } from '../config/env';
import { MEMORY_TENANT, getMemoryUnitOfWork, memoryReadModels } from './memory-driver';
import { DEMO_SETTINGS } from './settings';
import type { Runtime } from './runtime.provider';

/**
 * Runtime de la integracion externa, sintetizado desde el ENTORNO.
 *
 * No puede salir de `TENANT_CONTEXT`: ese se resuelve a partir de una identidad
 * verificada por `AuthMiddleware`, y aqui no hay sesion de usuario. Se construye una vez
 * por proceso —el tenant es fijo por configuracion, no por peticion— y por eso NO lleva
 * `Scope.REQUEST`: no cierra sobre nada que cambie de una llamada a otra.
 *
 * El actor lleva un identificador FIJO y no uno de la peticion. En Postgres, Row Level
 * Security comprueba la pertenencia con `app.is_member()` a partir del `sub` del token,
 * de modo que esa identidad tiene que existir como membresia ACTIVA de la empresa
 * configurada; si no, las lecturas devuelven cero filas (fallan cerradas, que es lo
 * correcto). Ver la nota en el informe: desplegar esto sobre Postgres exige crear esa
 * membresia de maquina.
 */
const DEFAULT_INTEGRATION_USER_ID = asId<UserId>('00000000-0000-4000-8000-000000000002');

function contextFromEnv(): TenantContext {
  const env = loadEnv();

  return {
    // En memoria existe UNA sola empresa, la sembrada; pedir la del entorno no tendria
    // nada que leer. Mismo criterio que `memoryContext` en `context.provider.ts`.
    tenantId:
      activeDriver() === 'memory'
        ? MEMORY_TENANT
        : asId<TenantId>(env.INTEGRATIONS_TENANT_ID ?? ''),
    tenantSlug: env.INTEGRATIONS_TENANT_SLUG ?? 'integracion',
    actor: {
      userId: env.INTEGRATIONS_USER_ID
        ? asId<UserId>(env.INTEGRATIONS_USER_ID)
        : DEFAULT_INTEGRATION_USER_ID,
      role: env.INTEGRATIONS_ACTOR_ROLE,
    },
    // Ningun documento de empresa real se sirve aqui: la integracion lee datos de un
    // cliente del producto, no de un sandbox de demostracion.
    plan: Plan.of('free'),
    // Los modelos de lectura solo usan `tenantId` para RLS; los ajustes son relleno.
    settings: DEMO_SETTINGS,
    isDemo: false,
  };
}

export const integrationsRuntimeProvider: FactoryProvider = {
  provide: INTEGRATIONS_RUNTIME,
  scope: Scope.DEFAULT,
  useFactory: (): Runtime => {
    const ctx = contextFromEnv();

    return activeDriver() === 'memory'
      ? {
          uow: getMemoryUnitOfWork(ctx.tenantId),
          queries: memoryReadModels(ctx.tenantId, ctx.settings.baseCurrency, ctx.actor.userId),
        }
      : postgresRuntime({
          url: databaseUrl(),
          ctx,
          ids: { next: () => uuidv7() },
          clock: systemClock,
          // Sin email verificado y sin cabeceras de navegador: no hay usuario detras.
          trace: { actorEmail: null, ipHash: null, userAgent: null },
        });
  },
};
