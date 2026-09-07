import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  Customer,
  Money,
  Product,
  Quantity,
  asId,
  type CustomerId,
  type ProductId,
} from '@corebiz/domain';
import { systemClock } from '@corebiz/application';
import { DrizzleUnitOfWork } from '../src/drizzle/unit-of-work';
import { getDatabase } from '@corebiz/db';
import {
  TEST_DATABASE_URL,
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testDb,
  testIds,
  type TestTenant,
} from './support/database';

/**
 * El Unit of Work contra Postgres de verdad.
 *
 * Estos tests son los que verifican lo que los dobles en memoria NO pueden
 * verificar: que las politicas RLS aplican, que la transaccion revierte, que los
 * movimientos de inventario se escriben y que el correlativo se bloquea.
 */

const db = getDatabase(TEST_DATABASE_URL);

function unitOfWork(tenant: TestTenant): DrizzleUnitOfWork {
  return new DrizzleUnitOfWork({ db, ctx: tenant.ctx, ids: testIds, clock: systemClock });
}

function aCustomer(tenant: TestTenant, code: string, name: string): Customer {
  const created = Customer.create({
    id: asId<CustomerId>(testIds.next()),
    tenantId: tenant.tenantId,
    code,
    name,
    createdAt: new Date(),
  });
  if (!created.ok) throw new Error(`No se pudo crear el cliente: ${JSON.stringify(created.error)}`);
  return created.value;
}

function aProduct(tenant: TestTenant, sku: string, initialStock: number): Product {
  const price = Money.of('10.00', 'USD');
  const quantity = Quantity.of(String(initialStock));
  if (!price.ok || !quantity.ok) throw new Error('Datos de prueba invalidos');

  const created = Product.create({
    id: asId<ProductId>(testIds.next()),
    tenantId: tenant.tenantId,
    sku,
    name: `Producto ${sku}`,
    price: price.value,
    initialStock: quantity.value,
    createdAt: new Date(),
  });
  if (!created.ok)
    throw new Error(`No se pudo crear el producto: ${JSON.stringify(created.error)}`);
  return created.value;
}

describe('DrizzleUnitOfWork', () => {
  let alpha: TestTenant;
  let beta: TestTenant;

  beforeAll(async () => {
    alpha = await createTestTenant({ slug: 'alpha' });
    beta = await createTestTenant({ slug: 'beta' });
  });

  afterAll(async () => {
    await dropTestTenant(alpha.tenantId);
    await dropTestTenant(beta.tenantId);
    await closeTestDatabase();
  });

  it('guarda y recupera un cliente pasando por las politicas RLS', async () => {
    const customer = aCustomer(alpha, 'CLI-001', 'Bodega La Esquina');

    await unitOfWork(alpha).run(async (repos) => {
      await repos.customers.save(customer);
    });

    const found = await unitOfWork(alpha).run((repos) => repos.customers.findById(customer.id));

    expect(found?.name).toBe('Bodega La Esquina');
    expect(found?.code).toBe('CLI-001');
  });

  it('no deja que un tenant vea los datos de otro', async () => {
    const customer = aCustomer(alpha, 'CLI-SECRETO', 'Solo de alpha');
    await unitOfWork(alpha).run((repos) => repos.customers.save(customer));

    // Mismo identificador, otro tenant. Si las politicas no aplicaran, esta
    // consulta devolveria la fila: es el fallo que hunde un SaaS multi-tenant.
    const leaked = await unitOfWork(beta).run((repos) => repos.customers.findById(customer.id));
    expect(leaked).toBeNull();

    const listed = await unitOfWork(beta).run((repos) => repos.customers.list({ limit: 100 }));
    expect(listed.items.map((c) => c.code)).not.toContain('CLI-SECRETO');
  });

  it('revierte la transaccion entera cuando algo lanza', async () => {
    const customer = aCustomer(alpha, 'CLI-ROLLBACK', 'No deberia quedar');

    await expect(
      unitOfWork(alpha).run(async (repos) => {
        await repos.customers.save(customer);
        await repos.usage.increment('customers');
        throw new Error('fallo a mitad de la escritura');
      }),
    ).rejects.toThrow('fallo a mitad');

    const found = await unitOfWork(alpha).run((repos) =>
      repos.customers.findByCode('CLI-ROLLBACK'),
    );
    expect(found).toBeNull();

    const used = await unitOfWork(alpha).run((repos) => repos.usage.current('customers'));
    expect(used).toBe(0);
  });

  it('escribe los movimientos de inventario junto al saldo', async () => {
    const product = aProduct(alpha, 'SKU-LEDGER', 40);

    await unitOfWork(alpha).run((repos) => repos.products.save(product));

    const movements = await testDb().execute(sql`
      select kind, quantity, balance_after, ref_type
        from public.stock_movements
       where product_id = ${product.id}
    `);

    // El alta con existencia inicial genera un movimiento de entrada. Si el
    // repositorio no drenase pullStockMovements(), el saldo estaria puesto pero
    // el libro mayor no lo explicaria.
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      kind: 'in',
      quantity: '40000',
      balance_after: '40000',
      ref_type: 'initial',
    });

    const reloaded = await unitOfWork(alpha).run((repos) => repos.products.findById(product.id));
    expect(reloaded?.onHand.toCompactString()).toBe('40');
  });

  it('entrega correlativos consecutivos y sin huecos', async () => {
    const uow = unitOfWork(beta);

    const first = await uow.run((repos) => repos.sequences.next('delivery_note'));
    const second = await uow.run((repos) => repos.sequences.next('delivery_note'));

    expect(first).toBe('NE-000001');
    expect(second).toBe('NE-000002');
  });

  it('no consume correlativo si la transaccion se revierte', async () => {
    const uow = unitOfWork(alpha);

    const before = await uow.run((repos) => repos.sequences.next('quote'));

    await expect(
      uow.run(async (repos) => {
        await repos.sequences.next('quote');
        throw new Error('la emision falla despues de numerar');
      }),
    ).rejects.toThrow();

    const after = await uow.run((repos) => repos.sequences.next('quote'));

    // Una SEQUENCE nativa de Postgres no se revierte y aqui habria un hueco.
    // Por eso el correlativo vive en una tabla.
    expect(before).toBe('PRE-000001');
    expect(after).toBe('PRE-000002');
  });
});
