import { describe, it, expect, beforeEach } from 'vitest';
import {
  Customer,
  Money,
  Product,
  Quantity,
  asId,
  unwrap,
  type CustomerId,
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
import { makeIssueDeliveryNote } from './issue-delivery-note';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('issueDeliveryNote', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;

  const seedCustomer = (creditLimit?: string) => {
    const customer = unwrap(
      Customer.create({
        id: asId<CustomerId>('cus-1'),
        tenantId: TENANT,
        code: 'CLI-001',
        name: 'Bodega La Esquina',
        creditLimit: creditLimit ? usd(creditLimit) : null,
        createdAt: NOW,
      }),
    );
    stores.customers.set(customer.id, customer);
    return customer;
  };

  const seedProduct = (sku: string, price: string, stock: string) => {
    const product = unwrap(
      Product.create({
        id: asId<ProductId>(`prd-${sku}`),
        tenantId: TENANT,
        sku,
        name: `Producto ${sku}`,
        price: usd(price),
        initialStock: qty(stock),
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
    return product;
  };

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    return makeIssueDeliveryNote({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('dn'),
    });
  };

  beforeEach(() => {
    stores = createSalesStores();
  });

  it('emite la nota, numera correlativamente y descuenta el stock', async () => {
    seedCustomer();
    const product = seedProduct('SKU-001', '25.00', '10');

    const result = await build()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '3' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.number).toBe('NE-000001');
      // 3 x 25,00 = 75,00 ; 16 % = 12,00 ; total 87,00
      expect(result.value.total).toBe('87.00');
      // 87,00 x 36,50 = 3175,50 Bs, con la tasa congelada del documento
      expect(result.value.totalInSecondaryCurrency).toBe('3175.50');
    }
    expect(product.onHand.toCompactString()).toBe('7');
  });

  it('la numeracion avanza documento a documento', async () => {
    seedCustomer();
    const product = seedProduct('SKU-001', '10.00', '100');
    const issue = build();

    const first = await issue({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });
    const second = await issue({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    expect(first.ok && first.value.number).toBe('NE-000001');
    expect(second.ok && second.value.number).toBe('NE-000002');
  });

  it('deja rastro en la auditoria, con la tasa aplicada', async () => {
    seedCustomer();
    const product = seedProduct('SKU-001', '25.00', '10');
    await build()({ customerId: 'cus-1', lines: [{ productId: product.id, quantity: '2' }] });

    expect(audit.entries[0]).toMatchObject({
      action: 'delivery_note.issued',
      entityType: 'delivery_note',
      summary: { number: 'NE-000001', customer: 'Bodega La Esquina', exchangeRate: '36.5' },
    });
  });

  it('acepta un precio distinto al del catalogo', async () => {
    seedCustomer();
    const product = seedProduct('SKU-001', '25.00', '10');

    const result = await build()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1', unitPrice: '20,00' }],
    });

    // 20,00 + 16 % = 23,20
    expect(result.ok && result.value.total).toBe('23.20');
  });

  it('aplica el descuento por linea', async () => {
    // El descuento viajaba en el contrato y en el caso de uso desde el principio, y el
    // formulario no lo pedia: llegaba siempre ausente. Se teclea en porcentaje y viaja
    // en puntos basicos —1000 es un 10 %— para que la aritmetica no arrastre decimales.
    seedCustomer();
    const product = seedProduct('SKU-001', '100.00', '10');

    const result = await build()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1', discountBp: 1000 }],
    });

    // 100,00 − 10 % = 90,00; + 16 % = 104,40
    expect(result.ok && result.value.total).toBe('104.40');
  });

  it('el descuento se aplica SOBRE el precio pactado, no sobre el de catalogo', async () => {
    // El orden importa y no es obvio: si el descuento se calculase sobre el catalogo,
    // pactar un precio y ademas descontar podria dejar la linea por debajo de cero.
    seedCustomer();
    const product = seedProduct('SKU-001', '100.00', '10');

    const result = await build()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1', unitPrice: '50.00', discountBp: 1000 }],
    });

    // 50,00 − 10 % = 45,00; + 16 % = 52,20
    expect(result.ok && result.value.total).toBe('52.20');
  });
});

describe('issueDeliveryNote — atomicidad', () => {
  let stores: SalesStores;

  beforeEach(() => {
    stores = createSalesStores();
    const customer = unwrap(
      Customer.create({
        id: asId<CustomerId>('cus-1'),
        tenantId: TENANT,
        code: 'CLI-001',
        name: 'Bodega La Esquina',
        createdAt: NOW,
      }),
    );
    stores.customers.set(customer.id, customer);
  });

  const seedProduct = (sku: string, stock: string) => {
    const product = unwrap(
      Product.create({
        id: asId<ProductId>(`prd-${sku}`),
        tenantId: TENANT,
        sku,
        name: `Producto ${sku}`,
        price: usd('10.00'),
        initialStock: qty(stock),
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
    return product;
  };

  const issue = () =>
    makeIssueDeliveryNote({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('dn'),
    });

  it('si UNA linea no tiene stock, NINGUNA se descuenta', async () => {
    // Es la garantia central del caso de uso: emitir es todo o nada.
    const disponible = seedProduct('SKU-001', '100');
    const agotado = seedProduct('SKU-002', '1');

    const result = await issue()({
      customerId: 'cus-1',
      lines: [
        { productId: disponible.id, quantity: '5' },
        { productId: agotado.id, quantity: '50' },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InsufficientStock');

    // El primer producto NO puede haber quedado descontado.
    expect(disponible.onHand.toCompactString()).toBe('100');
    expect(agotado.onHand.toCompactString()).toBe('1');
    expect(stores.deliveryNotes.size).toBe(0);
  });

  it('un fallo no consume el contador de documentos', async () => {
    const producto = seedProduct('SKU-001', '1');
    await issue()({ customerId: 'cus-1', lines: [{ productId: producto.id, quantity: '99' }] });

    expect(stores.usage.get(`${TENANT}:documents_month`) ?? 0).toBe(0);
  });
});

describe('issueDeliveryNote — autorizacion y limites', () => {
  let stores: SalesStores;

  const setup = () => {
    stores = createSalesStores();
    const customer = unwrap(
      Customer.create({
        id: asId<CustomerId>('cus-1'),
        tenantId: TENANT,
        code: 'CLI-001',
        name: 'Cliente',
        creditLimit: usd('50.00'),
        createdAt: NOW,
      }),
    );
    stores.customers.set(customer.id, customer);
    const product = unwrap(
      Product.create({
        id: asId<ProductId>('prd-1'),
        tenantId: TENANT,
        sku: 'SKU-001',
        name: 'Producto',
        price: usd('100.00'),
        initialStock: qty('100'),
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
    return product;
  };

  const issueWith = (ctx = makeTestContext()) =>
    makeIssueDeliveryNote({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('dn'),
    });

  it('almacen no puede emitir: entrega, pero no vende', async () => {
    const product = setup();
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'warehouse' } });

    const result = await issueWith(ctx)({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
  });

  it('un vendedor si puede emitir', async () => {
    const product = setup();
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'sales' } });

    const result = await issueWith(ctx)({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1', unitPrice: '10.00' }],
    });

    expect(result.ok).toBe(true);
  });

  it('respeta el limite de credito del cliente', async () => {
    // Limite 50,00 y el documento suma 116,00: no cabe.
    const product = setup();
    const result = await issueWith()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('CreditLimitExceeded');
  });

  it('no hay tope mensual de documentos', async () => {
    const product = setup();
    stores.usage.set(`${TENANT}:documents_month`, 2_000);

    const result = await issueWith()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1', unitPrice: '1.00' }],
    });

    expect(result.ok).toBe(true);
  });

  it('avisa si el cliente no existe', async () => {
    const product = setup();
    const result = await issueWith()({
      customerId: 'no-existe',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('CustomerNotFound');
  });

  it('avisa si un producto no existe', async () => {
    setup();
    const result = await issueWith()({
      customerId: 'cus-1',
      lines: [{ productId: 'prd-fantasma', quantity: '1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ProductNotFound');
  });

  it('rechaza cantidades invalidas antes de tocar el inventario', async () => {
    const product = setup();
    const result = await issueWith()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: 'dos' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidQuantity');
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('falla de forma explicita si el tenant no tiene tasa de cambio configurada', async () => {
    const product = setup();
    const ctx = makeTestContext({
      settings: {
        taxLabel: 'Impuesto informativo',
        taxRateBp: 1600,
        baseCurrency: 'USD',
        exchangeRateScaled: null,
        exchangeRateAt: null,
      },
    });

    const result = await issueWith(ctx)({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NoExchangeRate');
  });
});
