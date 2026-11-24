import {
  type CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from '@corebiz/application';
import { TENANT_CONTEXT } from '../tokens';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(TENANT_CONTEXT) private readonly ctx: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.ctx?.tenantId || !this.ctx?.actor) {
      throw new UnauthorizedException({
        errorKind: 'Unauthenticated',
        errorParams: { reason: 'MissingTenantContext' },
      });
    }

    const req = context.switchToHttp().getRequest<Request>();
    const headerTenantId = req.headers['x-tenant-id'];
    const requestedTenant = typeof headerTenantId === 'string' ? headerTenantId.trim() : undefined;

    if (requestedTenant && requestedTenant !== this.ctx.tenantId) {
      throw new ForbiddenException({
        errorKind: 'CrossTenantForbidden',
        errorParams: { currentTenant: this.ctx.tenantId, requestedTenant },
      });
    }

    return true;
  }
}
