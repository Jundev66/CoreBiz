import { describe, it, expect } from 'vitest';
import { Membership } from '../../src/access/membership';
import { unwrap } from '../../src/shared/result';

describe('Membership Aggregate', () => {
  const fixedDate = new Date('2026-11-23T12:00:00Z');

  it('creates a valid membership with default status active', () => {
    const result = Membership.create({
      id: 'mem-001',
      tenantId: 'tenant-ve-01',
      userId: 'user-001',
      role: 'owner',
      createdAt: fixedDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const membership = result.value;
    expect(membership.id).toBe('mem-001');
    expect(membership.tenantId).toBe('tenant-ve-01');
    expect(membership.userId).toBe('user-001');
    expect(membership.role).toBe('owner');
    expect(membership.status).toBe('active');
  });

  it('rejects creation when required identifiers are missing or empty', () => {
    const withoutId = Membership.create({
      id: '   ',
      tenantId: 'tenant-01',
      userId: 'user-01',
      role: 'admin',
      createdAt: fixedDate,
    });
    expect(withoutId.ok).toBe(false);

    const withoutTenant = Membership.create({
      id: 'mem-002',
      tenantId: '',
      userId: 'user-01',
      role: 'admin',
      createdAt: fixedDate,
    });
    expect(withoutTenant.ok).toBe(false);

    const withoutUser = Membership.create({
      id: 'mem-003',
      tenantId: 'tenant-01',
      userId: ' ',
      role: 'admin',
      createdAt: fixedDate,
    });
    expect(withoutUser.ok).toBe(false);
  });

  it('changes member role correctly', () => {
    const membership = unwrap(
      Membership.create({
        id: 'mem-004',
        tenantId: 'tenant-01',
        userId: 'user-01',
        role: 'sales',
        createdAt: fixedDate,
      }),
    );

    const changeResult = membership.changeRole('admin', fixedDate);
    expect(changeResult.ok).toBe(true);
    expect(membership.role).toBe('admin');
  });

  it('suspends and activates membership following state transitions', () => {
    const membership = unwrap(
      Membership.create({
        id: 'mem-005',
        tenantId: 'tenant-01',
        userId: 'user-01',
        role: 'warehouse',
        createdAt: fixedDate,
      }),
    );

    const suspendResult = membership.suspend(fixedDate);
    expect(suspendResult.ok).toBe(true);
    expect(membership.status).toBe('suspended');

    const doubleSuspend = membership.suspend(fixedDate);
    expect(doubleSuspend.ok).toBe(false);

    const activateResult = membership.activate(fixedDate);
    expect(activateResult.ok).toBe(true);
    expect(membership.status).toBe('active');

    const doubleActivate = membership.activate(fixedDate);
    expect(doubleActivate.ok).toBe(false);
  });

  it('converts to primitives accurately', () => {
    const membership = unwrap(
      Membership.create({
        id: 'mem-006',
        tenantId: 'tenant-us-01',
        userId: 'user-02',
        role: 'viewer',
        status: 'invited',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      }),
    );

    const primitives = membership.toPrimitives();
    expect(primitives).toEqual({
      id: 'mem-006',
      tenantId: 'tenant-us-01',
      userId: 'user-02',
      role: 'viewer',
      status: 'invited',
      createdAt: fixedDate,
      updatedAt: fixedDate,
    });
  });
});
