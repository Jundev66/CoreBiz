import { describe, it, expect } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/roles.guard';
import type { TenantContext } from '@corebiz/application';
import type { Role } from '@corebiz/domain';

describe('RolesGuard', () => {
  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const createTenantContext = (role?: Role): TenantContext =>
    ({
      tenantId: 'tenant-001',
      actor: role ? { userId: 'user-001', role } : undefined,
    }) as unknown as TenantContext;

  it('allows access when no roles are required on handler or class', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector, createTenantContext('sales'));
    const result = guard.canActivate(createMockContext());

    expect(result).toBe(true);
  });

  it('allows access when user possesses an authorized role', () => {
    const reflector = {
      getAllAndOverride: () => ['admin', 'owner'],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector, createTenantContext('admin'));
    const result = guard.canActivate(createMockContext());

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when user does not possess an authorized role', () => {
    const reflector = {
      getAllAndOverride: () => ['admin', 'owner'],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector, createTenantContext('sales'));

    expect(() => guard.canActivate(createMockContext())).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when actor role is missing from context', () => {
    const reflector = {
      getAllAndOverride: () => ['admin'],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector, createTenantContext(undefined));

    expect(() => guard.canActivate(createMockContext())).toThrow(ForbiddenException);
  });
});
