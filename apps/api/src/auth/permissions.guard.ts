import {
  type CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import { TENANT_CONTEXT } from '../tokens';
import { REQUIRED_PERMISSION } from './require-permission.decorator';

/**
 * Segunda capa de RBAC, no la primera.
 *
 * La autoridad sigue siendo el caso de uso: ahi es donde se comprueba el permiso y el
 * plan, y ahi tiene que seguir estando, porque es lo unico que garantiza que la regla
 * se aplique venga la peticion de donde venga. Este guard existe para responder 403
 * antes de abrir una transaccion contra Postgres, no para decidir.
 *
 * Si alguna vez el guard y el caso de uso discrepan, el que tiene razon es el caso de
 * uso.
 *
 * NO se registra como `APP_GUARD` global, y no es una omision. Un guard global con
 * `Scope.REQUEST` se instancia en TODAS las rutas, y al inyectar el contexto de tenant
 * arrastra consigo la resolucion de identidad — incluso en `/health`, que no tiene
 * sesion ni debe tenerla. Verified: with a global guard `/health` returned 500, and every
 * health check and keepalive would have reported an outage. It is applied with
 * `@UseGuards` on the controllers that declare permissions.
 */
@Injectable({ scope: Scope.REQUEST })
export class PermissionsGuard implements CanActivate {
  constructor(
    // `@Inject(Reflector)` explicito, aunque el tipo bastaria con `tsc`. Ver la nota
    // sobre metadatos al final de este archivo.
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    /*
     * A handler without a declared permission is DENIED, not waved through. Every handler
     * behind this guard declares one today; the point is the next one. Reads have no use
     * case behind them to catch a missing check, so a new GET without the decorator would
     * have been open to every member, `viewer` included, with nothing turning red.
     */
    if (required === undefined) {
      throw new ForbiddenException({ errorKind: 'Forbidden', errorParams: {} });
    }
    if (can(this.ctx.actor, required)) return true;

    throw new ForbiddenException({ errorKind: 'Forbidden', errorParams: { permission: required } });
  }
}

/*
 * NOTA SOBRE LOS METADATOS DE DECORADOR, que vale para toda la API.
 *
 * Ningun constructor de `apps/api` depende de `emitDecoratorMetadata`: todos declaran
 * su dependencia con `@Inject(...)`. Es mas verboso y es deliberado.
 *
 * El motivo se descubrio con un fallo: `tsc` —que construye el artefacto de
 * produccion— SI emite `design:paramtypes`, y esbuild —que es lo que usa Vitest para
 * transpilar— NO lo hace, y lo ignora sin avisar. Con inyeccion por tipo, la API
 * arrancaba perfectamente compilada y reventaba al montarla desde los tests con
 * "Nest can't resolve dependencies (?)". Codigo que se comporta distinto segun quien
 * lo transpile es peor que codigo verboso.
 *
 * Por eso `emitDecoratorMetadata` esta en `false` en el tsconfig: no basta con no
 * usarlo, hay que quitarlo, o el primer constructor que se escriba sin `@Inject`
 * funcionara en produccion y fallara solo en los tests.
 */
