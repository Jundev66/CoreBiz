import { describe, it, expect, beforeEach } from 'vitest';
import { asId, type TenantId } from '@corebiz/domain';
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
import { makeUpdateProduct } from './update-product';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('updateProduct', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;
  let uow: InMemoryUnitOfWork;

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    uow = new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit);
    return {
      createProduct: makeCreateProduct({
        uow,
        ctx,
        clock: fixedClock(NOW),
        ids: sequentialIdGenerator('prd'),
      }),
      updateProduct: makeUpdateProduct({ uow, ctx }),
    };
  };

  beforeEach(() => {
    stores = createSalesStores();
  });

  const alta = async (
    createProduct: ReturnType<typeof makeCreateProduct>,
    input: Parameters<ReturnType<typeof makeCreateProduct>>[0] = {
      name: 'Harina de trigo 1kg',
      sku: 'HRN-001',
      price: '2.50',
      initialStock: '100',
    },
  ) => {
    const creado = await createProduct(input);
    if (!creado.ok) throw new Error('el alta deberia haber funcionado');
    return creado.value;
  };

  it('EDITAR LA FICHA NO MUEVE EL INVENTARIO', async () => {
    // La afirmacion central de este caso de uso. El repositorio escribe `on_hand`
    // desde el agregado en el mismo UPSERT con el que guarda la ficha, asi que un
    // descuido aqui cambiaria el saldo sin dejar el asiento que lo explica — y el
    // inventario dejaria de cuadrar sin que nadie declarase una entrada ni una salida.
    const { createProduct, updateProduct } = build();
    const { id } = await alta(createProduct);

    const movimientosAntes = stores.stockMovements.length;
    const saldoAntes = stores.products.get(id)?.onHand.toCompactString();

    const result = await updateProduct({
      productId: id,
      name: 'Harina de trigo premium 1kg',
      price: '3.10',
      cost: '1.80',
      minStock: '20',
      description: 'Saco de 1 kg',
      unit: 'kg',
    });

    expect(result.ok).toBe(true);
    expect(stores.products.get(id)?.onHand.toCompactString()).toBe(saldoAntes);
    expect(stores.stockMovements.length).toBe(movimientosAntes);
  });

  it('no cambia el SKU aunque cambie todo lo demas', async () => {
    // El SKU esta impreso en la etiqueta del estante o es el codigo de barras del
    // fabricante. Cambiarlo aqui dejaria el estante diciendo una cosa y la pantalla otra.
    const { createProduct, updateProduct } = build();
    const { id, sku } = await alta(createProduct);

    const result = await updateProduct({
      productId: id,
      name: 'Otro nombre completamente',
      price: '9.99',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sku).toBe(sku);
    expect(stores.products.get(id)?.sku).toBe('HRN-001');
  });

  it('un precio ilegible se rechaza y no guarda nada', async () => {
    const { createProduct, updateProduct } = build();
    const { id } = await alta(createProduct);

    const result = await updateProduct({ productId: id, name: 'Harina', price: 'gratis' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InvalidPrice');
    expect(stores.products.get(id)?.price.toString()).toBe('2.50');
  });

  it('dejar el coste en blanco lo quita', async () => {
    const { createProduct, updateProduct } = build();
    const { id } = await alta(createProduct, {
      name: 'Harina de trigo 1kg',
      sku: 'HRN-001',
      price: '2.50',
      cost: '1.50',
    });
    expect(stores.products.get(id)?.cost).not.toBeNull();

    await updateProduct({ productId: id, name: 'Harina de trigo 1kg', price: '2.50', cost: '' });

    expect(stores.products.get(id)?.cost).toBeNull();
  });

  it('subir el minimo por encima del saldo marca bajo minimo sin tocar el saldo', async () => {
    const { createProduct, updateProduct } = build();
    const { id } = await alta(createProduct, {
      name: 'Harina de trigo 1kg',
      sku: 'HRN-001',
      price: '2.50',
      initialStock: '10',
    });

    await updateProduct({
      productId: id,
      name: 'Harina de trigo 1kg',
      price: '2.50',
      minStock: '25',
    });

    expect(stores.products.get(id)?.isBelowMinimum).toBe(true);
    expect(stores.products.get(id)?.onHand.toCompactString()).toBe('10');
  });

  it('registra en auditoria solo lo que cambio', async () => {
    const { createProduct, updateProduct } = build();
    const { id } = await alta(createProduct);

    await updateProduct({ productId: id, name: 'Harina de trigo 1kg', price: '3.00' });

    const entrada = audit.entries.find((e) => e.action === 'product.updated');
    expect(entrada?.diff).toEqual({ price: { de: '2.50', a: '3.00' } });
  });

  it('un producto que no existe responde NotFound', async () => {
    const { updateProduct } = build();

    const result = await updateProduct({ productId: 'no-existe', name: 'Nada', price: '1.00' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ProductNotFound');
  });

  it('sin permiso de escritura no toca nada', async () => {
    const { createProduct } = build();
    const { id } = await alta(createProduct);

    const soloLectura = makeTestContext({ actor: { userId: asId('u-1'), role: 'viewer' } });
    const updateProduct = makeUpdateProduct({ uow, ctx: soloLectura });

    const result = await updateProduct({ productId: id, name: 'Otro', price: '5.00' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('Forbidden');
    expect(stores.products.get(id)?.price.toString()).toBe('2.50');
  });
});
