import {
  CanActivate,
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
 * sesion ni debe tenerla. Se comprobo: con el guard global, `/health` devolvia 500 y
 * Render habria revertido cada despliegue. Se aplica con `@UseGuards` en los
 * controllers que declaran permisos.
 */
@Injectable({ scope: Scope.REQUEST })
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined) return true;
    if (can(this.ctx.actor, required)) return true;

    throw new ForbiddenException({ errorKind: 'Forbidden', errorParams: { permission: required } });
  }
}
