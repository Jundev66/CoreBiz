import { describe, it, expect } from 'vitest';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { TenantContextGuard } from '../../src/auth/tenant-context.guard';
import type { TenantContext } from '@corebiz/application';

describe('TenantContextGuard', () => {
  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const req = {
      headers,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  const createTenantContext = (tenantId = '018e245a-0000-7000-8000-000000000001'): TenantContext =>
    ({
      tenantId,
      actor: {
        userId: '018e245a-0000-7000-8000-000000000002',
        role: 'owner',
      },
    }) as unknown as TenantContext;

  it('allows access when context is valid and x-tenant-id header is omitted', () => {
    const guard = new TenantContextGuard(createTenantContext());
    const result = guard.canActivate(createMockContext());

    expect(result).toBe(true);
  });

  it('allows access when x-tenant-id header matches current tenant context', () => {
    const tenantId = '018e245a-0000-7000-8000-000000000001';
    const guard = new TenantContextGuard(createTenantContext(tenantId));
    const result = guard.canActivate(createMockContext({ 'x-tenant-id': tenantId }));

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when x-tenant-id header targets a different tenant', () => {
    const currentTenant = '018e245a-0000-7000-8000-000000000001';
    const foreignTenant = '018e245a-9999-7000-8000-000000000002';
    const guard = new TenantContextGuard(createTenantContext(currentTenant));

    expect(() => guard.canActivate(createMockContext({ 'x-tenant-id': foreignTenant }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws UnauthorizedException when tenant context is missing', () => {
    const guard = new TenantContextGuard(null as unknown as TenantContext);

    expect(() => guard.canActivate(createMockContext())).toThrow(UnauthorizedException);
  });
});
