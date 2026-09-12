import { Scope, type FactoryProvider } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { uuidv7 } from 'uuidv7';
import {
  systemClock,
  type ReadModels,
  type TenantContext,
  type UnitOfWork,
} from '@corebiz/application';
import { postgresRuntime, type AuditTrace } from '@corebiz/infrastructure';
import { RUNTIME, TENANT_CONTEXT } from '../tokens';
import { activeDriver, databaseUrl } from '../config/driver';
import { getMemoryUnitOfWork, memoryReadModels } from './memory-driver';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

export interface Runtime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
}

/**
 * Who is acting, for audit rows.
 *
 * The email comes from `req.auth`, the ALREADY VERIFIED token — not from a header. The
 * other two do arrive as headers, set by the web tier: the IP hash is computed there
 * because it is the only place where `x-forwarded-for` cannot be forged, and the agent is
 * what the browser says about itself. What that is worth, and what it is not, is written
 * down in `AuditTrace`.
 */
function traceOf(req: AuthenticatedRequest): AuditTrace {
  const header = (name: string): string | null => {
    const value = req.header(name);
    return value === undefined || value === '' ? null : value;
  };

  return {
    actorEmail: req.auth?.email ?? null,
    ipHash: header('x-corebiz-fingerprint'),
    userAgent: header('x-corebiz-agent'),
  };
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
  inject: [TENANT_CONTEXT, REQUEST],
  useFactory: (ctx: TenantContext, req: AuthenticatedRequest): Runtime =>
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
          trace: traceOf(req),
        }),
};
