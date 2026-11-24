import {
  type CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import { TENANT_CONTEXT } from '../tokens';
import { REQUIRED_ROLES } from './require-role.decorator';

@Injectable({ scope: Scope.REQUEST })
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!this.ctx?.actor?.role) {
      throw new ForbiddenException({ errorKind: 'Forbidden', errorParams: {} });
    }

    const currentRole = this.ctx.actor.role;
    if (requiredRoles.includes(currentRole)) {
      return true;
    }

    throw new ForbiddenException({
      errorKind: 'Forbidden',
      errorParams: { requiredRoles, currentRole },
    });
  }
}
