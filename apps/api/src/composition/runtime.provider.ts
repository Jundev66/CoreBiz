import { Scope, type FactoryProvider } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import {
  systemClock,
  type ReadModels,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import { postgresRuntime } from '@corebiz/infrastructure';
import { RUNTIME, TENANT_CONTEXT } from '../tokens';
import { activeDriver, databaseUrl } from './driver';
import { getMemoryUnitOfWork, memoryReadModels } from './memory-driver';

export interface Runtime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
}

/**
 * Los puertos, ya cumplidos por una implementacion concreta.
 *
 * `postgresRuntime` no se toca: es el mismo punto de entrada que usaba Next, y dentro
 * sigue estando `establishTenantContext` corriendo DENTRO de la transaccion con
 * `set_config(..., true)`. Row Level Security no se entera de que ha cambiado el
 * framework, que es exactamente lo que tenia que pasar.
 *
 * `Scope.REQUEST` porque cierra sobre `ctx`. Bajarlo a `Scope.DEFAULT` "para
 * optimizar" es el peor fallo posible de esta migracion: el contexto de la primera
 * peticion quedaria capturado para siempre y la API serviria los datos de esa empresa
 * a todas las demas, sin error y sin log.
 *
 * El POOL si se comparte, y debe compartirse: `getDatabase(url)` lo cachea por URL en
 * `globalThis`, y es seguro precisamente porque las variables de sesion son locales a
 * la transaccion.
 */
export const runtimeProvider: FactoryProvider = {
  provide: RUNTIME,
  scope: Scope.REQUEST,
  inject: [TENANT_CONTEXT],
  useFactory: (ctx: TenantContext): Runtime =>
    activeDriver() === 'memory'
      ? {
          uow: getMemoryUnitOfWork(ctx.tenantId),
          queries: memoryReadModels(ctx.tenantId, ctx.settings.baseCurrency, ctx.actor.userId),
        }
      : postgresRuntime({
          url: databaseUrl(),
          ctx,
          ids: { next: () => uuidv7() },
          clock: systemClock,
        }),
};
