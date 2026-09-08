import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Money, Plan, Product, Quantity, asId, type ProductId } from '@corebiz/domain';
import { makeCreateSupplier, makeReceiveGoods, systemClock } from '@corebiz/application';
import { getDatabase } from '@corebiz/db';
import { DrizzleUnitOfWork } from '../src/drizzle/unit-of-work';
import {
  TEST_DATABASE_URL,
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testIds,
  type TestTenant,
} from './support/database';

/**
 * Compras contra Postgres.
 *
 * Lo que se comprueba aqui no es que el documento se guarde —eso lo cubre
 * cualquier test— sino la afirmacion central del modulo: que recibir mercancia
 * mueve EL MISMO libro mayor del que resta emitir una nota. Un test que solo
 * mirase `products.on_hand` pasaria igual con un sistema que tuviera dos
 * inventarios paralelos, que es exactamente el error que se quiere impedir.
 */

const db = getDatabase(TEST_DATABASE_URL);

afterAll(closeTestDatabase);

describe('Recepcion de mercancia', () => {
  let tenant: TestTenant;

  /** El modulo esta gated a PRO, asi que el contexto tiene que tenerlo. */
  const pro = (): TestTenant => ({
    ...tenant,
    ctx: { ...tenant.ctx, plan: Plan.of('pro') },
  });

  function uow(t: TestTenant): DrizzleUnitOfWork {
    return new DrizzleUnitOfWork({ db, ctx: t.ctx, ids: testIds, clock: systemClock });
  }

  async function seedProduct(sku: string, initial: number): Promise<ProductId> {
    const price = Money.of('10.00', 'USD');
    const quantity = Quantity.of(String(initial));
    if (!price.ok || !quantity.ok) throw new Error('datos de prueba invalidos');

    const created = Product.create({
      id: asId<ProductId>(testIds.next()),
      tenantId: tenant.tenantId,
      sku,
      name: `Producto ${sku}`,
      price: price.value,
      initialStock: quantity.value,
      createdAt: new Date(),
    });
    if (!created.ok) throw new Error('no se pudo crear el producto');

    await uow(tenant).run((repos) => repos.products.save(created.value));
    return created.value.id;
  }

  async function newSupplier(code: string): Promise<string> {
    const t = pro();
    const createSupplier = makeCreateSupplier({
      uow: uow(t),
      ctx: t.ctx,
      clock: systemClock,
      ids: testIds,
    });

    const result = await createSupplier({ name: `Proveedor ${code}` });
    if (!result.ok)
      throw new Error(`no se pudo crear el proveedor: ${JSON.stringify(result.error)}`);
    return result.value.id;
  }

  beforeEach(async () => {
    tenant = await createTestTenant({ slug: `compras-${randomUUID().slice(0, 8)}` });
  });

  it('suma al inventario y deja el movimiento que lo explica', async () => {
    const productId = await seedProduct('SKU-COMPRA', 40);
    const supplierId = await newSupplier('PRV-001');

    const t = pro();
    const receiveGoods = makeReceiveGoods({
      uow: uow(t),
      ctx: t.ctx,
      clock: systemClock,
      ids: testIds,
    });

    const result = await receiveGoods({
      supplierId,
      lines: [{ productId, quantity: '15', unitCost: '3.50' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total).toBe('52.50');

    // El saldo subio...
    const product = await uow(tenant).run((repos) => repos.products.findById(productId));
    expect(product?.onHand.toCompactString()).toBe('55');

    // ...y hay un movimiento que lo explica, en el MISMO libro mayor del que
    // resta la emision de una nota. Sin esta fila, el inventario habria cambiado
    // sin que nada pudiera decir por que.
    const movements = await db.execute(sql`
      select kind, quantity, balance_after, ref_type, ref_id
        from public.stock_movements
       where product_id = ${productId} and ref_type = 'goods_receipt'
    `);

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      kind: 'in',
      quantity: '15000',
      balance_after: '55000',
      ref_id: result.value.id,
    });

    await dropTestTenant(tenant.tenantId);
  });

  it('el correlativo de recepciones es independiente del de las notas', async () => {
    const productId = await seedProduct('SKU-CORREL', 10);
    const supplierId = await newSupplier('PRV-002');

    const t = pro();
    const receiveGoods = makeReceiveGoods({
      uow: uow(t),
      ctx: t.ctx,
      clock: systemClock,
      ids: testIds,
    });

    const first = await receiveGoods({
      supplierId,
      lines: [{ productId, quantity: '1', unitCost: '1.00' }],
    });
    const second = await receiveGoods({
      supplierId,
      lines: [{ productId, quantity: '1', unitCost: '1.00' }],
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Prefijo propio y numeracion propia: mezclar los correlativos de compra y
    // venta haria imposible explicar un hueco en cualquiera de los dos.
    expect(first.value.number).toBe('RM-000001');
    expect(second.value.number).toBe('RM-000002');

    await dropTestTenant(tenant.tenantId);
  });

  it('el plan gratuito no puede usar el modulo, ni por la puerta de atras', async () => {
    // Contexto FREE: es exactamente lo que llega si alguien invoca la Server
    // Action a mano sin pasar por la pantalla, que es lo unico que la pantalla
    // no puede impedir.
    const receiveGoods = makeReceiveGoods({
      uow: uow(tenant),
      ctx: tenant.ctx,
      clock: systemClock,
      ids: testIds,
    });

    const result = await receiveGoods({ supplierId: randomUUID(), lines: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: 'FeatureNotAvailable',
        feature: 'purchasing',
        requiredPlan: 'pro',
      });
    }

    await dropTestTenant(tenant.tenantId);
  });

  it('no deja recibir mercancia de un proveedor de otra empresa', async () => {
    const otra = await createTestTenant({ slug: `ajena-${randomUUID().slice(0, 8)}` });
    const productId = await seedProduct('SKU-AJENO', 10);

    // El proveedor se crea en la OTRA empresa.
    const ajena: TestTenant = { ...otra, ctx: { ...otra.ctx, plan: Plan.of('pro') } };
    const createSupplier = makeCreateSupplier({
      uow: uow(ajena),
      ctx: ajena.ctx,
      clock: systemClock,
      ids: testIds,
    });
    const supplier = await createSupplier({ name: 'Proveedor ajeno' });
    expect(supplier.ok).toBe(true);
    if (!supplier.ok) return;

    const t = pro();
    const receiveGoods = makeReceiveGoods({
      uow: uow(t),
      ctx: t.ctx,
      clock: systemClock,
      ids: testIds,
    });

    const result = await receiveGoods({
      supplierId: supplier.value.id,
      lines: [{ productId, quantity: '5', unitCost: '1.00' }],
    });

    // No es un error de permisos: para esta empresa, ese proveedor sencillamente
    // no existe. Es lo que hacen las politicas RLS, y es la respuesta correcta —
    // un 403 confirmaria que el identificador es de algo real.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('SupplierNotFound');

    await dropTestTenant(tenant.tenantId);
    await dropTestTenant(otra.tenantId);
  });
});
