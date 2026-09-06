import { describe, it, expect, beforeEach } from 'vitest';
import {
  Plan,
  Product,
  Money,
  Quantity,
  asId,
  unwrap,
  type ProductId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  InMemoryAuditLogger,
  createSalesStores,
  makeTestContext,
  type SalesStores,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeCreateProduct } from './create-product';
import { makeAdjustStock } from './adjust-stock';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('createProduct', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    return makeCreateProduct({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('prd'),
    });
  };

  beforeEach(() => {
    stores = createSalesStores();
  });

  it('crea el producto normalizando el SKU', async () => {
    const result = await build()({ sku: ' hrn-001 ', name: 'Harina 1kg', price: '2.50' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sku).toBe('HRN-001');
    expect(stores.products.size).toBe(1);
  });

  it('acepta importes con coma decimal', async () => {
    await build()({ sku: 'A', name: 'Producto', price: '2,50', cost: '1,80' });
    const product = [...stores.products.values()][0];

    expect(product?.price.toString()).toBe('2.50');
    expect(product?.cost?.toString()).toBe('1.80');
  });

  it('registra el stock inicial y lo refleja en la auditoria', async () => {
    await build()({ sku: 'A', name: 'Producto', price: '1.00', initialStock: '250' });

    expect([...stores.products.values()][0]?.onHand.toCompactString()).toBe('250');
    expect(audit.entries[0]).toMatchObject({
      action: 'product.created',
      summary: { sku: 'A', initialStock: '250' },
    });
  });

  it('rechaza un SKU duplicado, ya normalizado', async () => {
    const create = build();
    await create({ sku: 'HRN-001', name: 'Primero', price: '1.00' });
    const duplicate = await create({ sku: ' hrn-001 ', name: 'Segundo', price: '2.00' });

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.kind).toBe('DuplicateSku');
    expect(stores.products.size).toBe(1);
  });

  it('rechaza precios, costos y stock mal formados', async () => {
    const create = build();
    expect((await create({ sku: 'A', name: 'Producto', price: 'gratis' })).ok).toBe(false);
    expect((await create({ sku: 'B', name: 'Producto', price: '1', cost: 'poco' })).ok).toBe(false);
    expect(
      (await create({ sku: 'C', name: 'Producto', price: '1', initialStock: 'muchos' })).ok,
    ).toBe(false);
    expect(stores.products.size).toBe(0);
  });

  it('trata las cadenas vacias como campos ausentes', async () => {
    await build()({ sku: 'A', name: 'Producto', price: '1.00', cost: '  ', initialStock: '' });
    const product = [...stores.products.values()][0];

    expect(product?.cost).toBeNull();
    expect(product?.onHand.toCompactString()).toBe('0');
  });

  it('un vendedor no puede dar de alta productos', async () => {
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'sales' } });
    const result = await build(ctx)({ sku: 'A', name: 'Producto', price: '1.00' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
  });

  it('almacen si puede: es su responsabilidad', async () => {
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'warehouse' } });
    expect((await build(ctx)({ sku: 'A', name: 'Producto', price: '1.00' })).ok).toBe(true);
  });

  it('respeta la cuota de productos del plan', async () => {
    stores.usage.set(`${TENANT}:products`, 100);
    const result = await build()({ sku: 'A', name: 'Producto', price: '1.00' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('QuotaExceeded');
  });

  it('con plan PRO la misma cuota deja continuar', async () => {
    stores.usage.set(`${TENANT}:products`, 100);
    const ctx = makeTestContext({ plan: Plan.of('pro') });
    expect((await build(ctx)({ sku: 'A', name: 'Producto', price: '1.00' })).ok).toBe(true);
  });
});

describe('adjustStock', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;

  const seedProduct = (stock: string) => {
    const product = unwrap(
      Product.create({
        id: asId<ProductId>('prd-1'),
        tenantId: TENANT,
        sku: 'SKU-001',
        name: 'Harina 1kg',
        price: unwrap(Money.of('2.50', 'USD')),
        initialStock: unwrap(Quantity.of(stock)),
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
    return product;
  };

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    return makeAdjustStock({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
    });
  };

  beforeEach(() => {
    stores = createSalesStores();
  });

  it('ajusta el saldo y devuelve el antes y el despues', async () => {
    const product = seedProduct('100');
    const result = await build()({
      productId: product.id,
      newBalance: '95',
      reason: 'Conteo fisico: merma',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.previous).toBe('100');
      expect(result.value.current).toBe('95');
    }
    expect(product.onHand.toCompactString()).toBe('95');
  });

  it('la auditoria guarda saldo anterior, nuevo y motivo', async () => {
    // Sin las tres cosas, la entrada de auditoria no explica nada meses despues.
    const product = seedProduct('100');
    await build()({ productId: product.id, newBalance: '95', reason: 'Merma por humedad' });

    expect(audit.entries[0]).toMatchObject({
      action: 'stock.adjusted',
      summary: { sku: 'SKU-001', previous: '100', current: '95', reason: 'Merma por humedad' },
    });
  });

  it('exige un motivo', async () => {
    const product = seedProduct('100');
    const result = await build()({ productId: product.id, newBalance: '95', reason: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Required');
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('un vendedor no ajusta inventario', async () => {
    const product = seedProduct('100');
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'sales' } });
    const result = await build(ctx)({ productId: product.id, newBalance: '95', reason: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
  });

  it('almacen si ajusta', async () => {
    const product = seedProduct('100');
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'warehouse' } });
    expect(
      (await build(ctx)({ productId: product.id, newBalance: '95', reason: 'Conteo' })).ok,
    ).toBe(true);
  });

  it('avisa si el producto no existe', async () => {
    const result = await build()({ productId: 'fantasma', newBalance: '1', reason: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ProductNotFound');
  });

  it('rechaza una cantidad mal formada', async () => {
    const product = seedProduct('100');
    const result = await build()({ productId: product.id, newBalance: 'noventa', reason: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidQuantity');
  });
});
