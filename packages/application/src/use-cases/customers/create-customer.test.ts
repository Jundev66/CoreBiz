import { describe, it, expect, beforeEach } from 'vitest';
import { Plan, asId, type Customer, type TenantId, type UserId } from '@corebiz/domain';
import { InMemoryUnitOfWork, InMemoryAuditLogger, makeTestContext } from '@corebiz/testing';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeCreateCustomer } from './create-customer';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-09-06T12:00:00.000Z');

describe('createCustomer', () => {
  let customers: Map<string, Customer>;
  let usage: Map<string, number>;
  let audit: InMemoryAuditLogger;
  let uow: InMemoryUnitOfWork;

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    uow = new InMemoryUnitOfWork(customers, usage, TENANT, audit);
    return makeCreateCustomer({
      uow,
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('cus'),
    });
  };

  beforeEach(() => {
    customers = new Map();
    usage = new Map();
  });

  it('da de alta un cliente y devuelve su codigo normalizado', async () => {
    const result = await build()({ code: ' cli-001 ', name: 'Bodega La Esquina' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.code).toBe('CLI-001');
    expect(customers.size).toBe(1);
  });

  it('incrementa el contador de uso, que es lo que alimenta la cuota', async () => {
    const createCustomer = build();
    await createCustomer({ code: 'A', name: 'Cliente A' });
    await createCustomer({ code: 'B', name: 'Cliente B' });

    expect(usage.get(`${TENANT}:customers`)).toBe(2);
  });

  it('deja rastro en la auditoria', async () => {
    await build()({ code: 'CLI-001', name: 'Bodega La Esquina' });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'customer.created',
      entityType: 'customer',
      summary: { code: 'CLI-001', name: 'Bodega La Esquina' },
    });
  });
});

describe('createCustomer — autorizacion', () => {
  it('un observador no puede crear clientes', async () => {
    const ctx = makeTestContext({
      actor: { userId: asId<UserId>('u'), role: 'viewer' },
    });
    const customers = new Map<string, Customer>();
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), TENANT),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    const result = await createCustomer({ code: 'X', name: 'Cliente X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
    // El bloqueo ocurre ANTES de abrir la transaccion: no se escribe nada.
    expect(customers.size).toBe(0);
  });

  it('almacen tampoco: no es su responsabilidad', async () => {
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'warehouse' } });
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(new Map(), new Map(), TENANT),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    expect((await createCustomer({ code: 'X', name: 'Cliente X' })).ok).toBe(false);
  });

  it('un vendedor si puede', async () => {
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'sales' } });
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(new Map(), new Map(), TENANT),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    expect((await createCustomer({ code: 'X', name: 'Cliente X' })).ok).toBe(true);
  });
});

describe('createCustomer — cuota del plan', () => {
  it('bloquea al alcanzar el limite del plan gratuito', async () => {
    const customers = new Map<string, Customer>();
    const usage = new Map<string, number>([[`${TENANT}:customers`, 50]]);
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, usage, TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    const result = await createCustomer({ code: 'X', name: 'Cliente X' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('QuotaExceeded');
      if (result.error.kind === 'QuotaExceeded') {
        expect(result.error.limit).toBe(50);
        expect(result.error.resource).toBe('customers');
      }
    }
    expect(customers.size).toBe(0);
  });

  it('el mismo tenant con plan PRO si puede seguir', async () => {
    const usage = new Map<string, number>([[`${TENANT}:customers`, 50]]);
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(new Map(), usage, TENANT),
      ctx: makeTestContext({ plan: Plan.of('pro') }),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    expect((await createCustomer({ code: 'X', name: 'Cliente X' })).ok).toBe(true);
  });
});

describe('createCustomer — reglas de negocio', () => {
  it('rechaza un codigo duplicado, comparando ya normalizado', async () => {
    const customers = new Map<string, Customer>();
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    await createCustomer({ code: 'CLI-001', name: 'Primero' });
    // Distinta caja y con espacios: sigue siendo el mismo codigo.
    const duplicate = await createCustomer({ code: ' cli-001 ', name: 'Segundo' });

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.kind).toBe('DuplicateCode');
    expect(customers.size).toBe(1);
  });

  it('propaga los errores de validacion del dominio sin reinterpretarlos', async () => {
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(new Map(), new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    const result = await createCustomer({ code: 'X', name: 'A' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('TooShort');
  });

  it('rechaza un limite de credito con formato invalido', async () => {
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(new Map(), new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    const result = await createCustomer({ code: 'X', name: 'Cliente', creditLimit: 'mucho' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidCreditLimit');
  });

  it('acepta el limite de credito con coma decimal', async () => {
    const customers = new Map<string, Customer>();
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    const result = await createCustomer({ code: 'X', name: 'Cliente', creditLimit: '1500,50' });
    expect(result.ok).toBe(true);
    expect([...customers.values()][0]?.creditLimit?.toString()).toBe('1500.50');
  });

  it('trata la cadena vacia como "sin limite de credito"', async () => {
    const customers = new Map<string, Customer>();
    const createCustomer = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator(),
    });

    await createCustomer({ code: 'X', name: 'Cliente', creditLimit: '   ' });
    expect([...customers.values()][0]?.creditLimit).toBeNull();
  });
});

describe('createCustomer — aislamiento entre tenants', () => {
  it('el mismo codigo puede existir en dos empresas distintas', async () => {
    // Dos comercios pueden usar "CLI-001" a la vez: el codigo es unico POR TENANT.
    const customers = new Map<string, Customer>();
    const otherTenant = asId<TenantId>('tenant-otro');

    const forTenantA = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('a'),
    });
    const forTenantB = makeCreateCustomer({
      uow: new InMemoryUnitOfWork(customers, new Map(), otherTenant),
      ctx: makeTestContext({ tenantId: otherTenant }),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('b'),
    });

    expect((await forTenantA({ code: 'CLI-001', name: 'Cliente de A' })).ok).toBe(true);
    expect((await forTenantB({ code: 'CLI-001', name: 'Cliente de B' })).ok).toBe(true);
    expect(customers.size).toBe(2);
  });
});
