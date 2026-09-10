import { describe, it, expect, beforeEach } from 'vitest';
import { asId, Customer, Money, type TenantId } from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  InMemoryAuditLogger,
  makeTestContext,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeCreateCustomer } from './create-customer';
import { makeUpdateCustomer } from './update-customer';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-09-06T12:00:00.000Z');

describe('updateCustomer', () => {
  let customers: Map<string, Customer>;
  let usage: Map<string, number>;
  let audit: InMemoryAuditLogger;
  let uow: InMemoryUnitOfWork;

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    uow = new InMemoryUnitOfWork(customers, usage, TENANT, audit);
    return {
      createCustomer: makeCreateCustomer({
        uow,
        ctx,
        clock: fixedClock(NOW),
        ids: sequentialIdGenerator('cus'),
      }),
      updateCustomer: makeUpdateCustomer({ uow, ctx, clock: fixedClock(NOW) }),
    };
  };

  beforeEach(() => {
    customers = new Map();
    usage = new Map();
  });

  /** Da de alta uno y devuelve su id. */
  const alta = async (
    createCustomer: ReturnType<typeof makeCreateCustomer>,
    input: Parameters<ReturnType<typeof makeCreateCustomer>>[0] = { name: 'Bodega La Esquina' },
  ) => {
    const creado = await createCustomer(input);
    if (!creado.ok) throw new Error('el alta deberia haber funcionado');
    return creado.value;
  };

  it('corrige el nombre sin cambiar el codigo', async () => {
    // Es el motivo por el que existe este caso de uso. Antes, corregir un nombre
    // obligaba a archivar y crear otro — que nace con un codigo nuevo y deja las
    // notas de entrega viejas apuntando a una ficha muerta.
    const { createCustomer, updateCustomer } = build();
    const { id, code } = await alta(createCustomer);

    const result = await updateCustomer({ customerId: id, name: 'Bodega La Esquina C.A.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe(code);
    expect(customers.get(id)?.name).toBe('Bodega La Esquina C.A.');
  });

  it('vacia la direccion cuando el formulario llega en blanco', async () => {
    // El fallo que motivo tocar el dominio: `?? this.props.address` hacia que una
    // direccion no se pudiera borrar nunca, y quien se mudaba seguia llevando la
    // vieja impresa en la siguiente nota de entrega.
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer, {
      name: 'Bodega La Esquina',
      addressLine1: 'Av. Principal 12',
      addressCity: 'Valencia',
    });
    expect(customers.get(id)?.address).not.toBeNull();

    const result = await updateCustomer({ customerId: id, name: 'Bodega La Esquina' });

    expect(result.ok).toBe(true);
    expect(customers.get(id)?.address).toBeNull();
  });

  it('registra en auditoria SOLO los campos que cambiaron', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer, {
      name: 'Bodega La Esquina',
      phone: '0212-5551234',
      email: 'hola@bodega.com',
    });

    await updateCustomer({
      customerId: id,
      name: 'Bodega La Esquina',
      phone: '0414-9999999',
      email: 'hola@bodega.com',
    });

    const entrada = audit.entries.find((e) => e.action === 'customer.updated');
    expect(entrada).toBeDefined();
    expect(entrada?.diff).toEqual({
      phone: { de: '0212-5551234', a: '0414-9999999' },
    });
  });

  it('no deja rastro en auditoria si el guardado no cambia nada', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer, { name: 'Bodega La Esquina' });

    await updateCustomer({ customerId: id, name: 'Bodega La Esquina' });

    const entrada = audit.entries.find((e) => e.action === 'customer.updated');
    expect(entrada?.diff).toEqual({});
  });

  it('un nombre invalido no guarda nada', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer);

    const result = await updateCustomer({ customerId: id, name: 'A' });

    expect(result.ok).toBe(false);
    expect(customers.get(id)?.name).toBe('Bodega La Esquina');
    expect(audit.entries.some((e) => e.action === 'customer.updated')).toBe(false);
  });

  it('un cliente que no existe responde NotFound, no Forbidden', async () => {
    // Pedir la ficha de otro comercio tiene que ser indistinguible de pedir una que
    // no hay: un 403 confirmaria que el identificador existe en algun sitio.
    const { updateCustomer } = build();

    const result = await updateCustomer({ customerId: 'no-existe', name: 'Cualquiera' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('CustomerNotFound');
  });

  it('sin permiso de escritura no llega ni a buscar', async () => {
    const { createCustomer } = build();
    const { id } = await alta(createCustomer);

    const soloLectura = makeTestContext({ actor: { userId: asId('u-1'), role: 'viewer' } });
    const updateCustomer = makeUpdateCustomer({
      uow,
      ctx: soloLectura,
      clock: fixedClock(NOW),
    });

    const result = await updateCustomer({ customerId: id, name: 'Otro nombre' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('Forbidden');
    expect(customers.get(id)?.name).toBe('Bodega La Esquina');
  });

  it('fija el limite de credito consultando el saldo pendiente', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer);

    const result = await updateCustomer({
      customerId: id,
      name: 'Bodega La Esquina',
      creditLimit: '500.00',
    });

    expect(result.ok).toBe(true);
    expect(customers.get(id)?.creditLimit?.toString()).toBe('500.00');
  });

  it('un limite de credito ilegible se distingue de uno que no cabe', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer);

    const result = await updateCustomer({
      customerId: id,
      name: 'Bodega La Esquina',
      creditLimit: 'muchisimo',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 400 y no 422: es la FORMA lo que esta mal, no la regla de negocio.
    expect(result.error.kind).toBe('InvalidCreditLimit');
  });

  it('dejar el limite en blanco lo quita', async () => {
    const { createCustomer, updateCustomer } = build();
    const { id } = await alta(createCustomer, {
      name: 'Bodega La Esquina',
      creditLimit: '300.00',
    });
    expect(customers.get(id)?.creditLimit).not.toBeNull();

    await updateCustomer({ customerId: id, name: 'Bodega La Esquina', creditLimit: '' });

    expect(customers.get(id)?.creditLimit).toBeNull();
  });

  it('el limite por debajo del saldo pendiente se rechaza como regla de negocio', () => {
    // Hoy el saldo es siempre cero porque no hay modulo de cobros, asi que la regla
    // no llega a dispararse por si sola. Se comprueba contra el dominio directamente
    // para que el dia que haya cobros que restar esto ya este cubierto.
    const customer = Customer.create({
      id: asId('c-1'),
      tenantId: TENANT,
      code: 'CLT26000001',
      name: 'Bodega La Esquina',
      createdAt: NOW,
    });
    if (!customer.ok) throw new Error('alta invalida en el arnes');

    const saldo = Money.of('250.00', 'USD');
    const limite = Money.of('100.00', 'USD');
    if (!saldo.ok || !limite.ok) throw new Error('importes invalidos en el arnes');

    const result = customer.value.setCreditLimit(limite.value, saldo.value);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('CreditLimitBelowBalance');
  });
});
