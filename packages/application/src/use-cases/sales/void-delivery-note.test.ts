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
import { makeVoidDeliveryNote } from './void-delivery-note';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('voidDeliveryNote', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;
  let product: Product;

  const setup = () => {
    stores = createSalesStores();
    audit = new InMemoryAuditLogger(TENANT);

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

    product = unwrap(
      Product.create({
        id: asId<ProductId>('prd-1'),
        tenantId: TENANT,
        sku: 'SKU-001',
        name: 'Harina 1kg',
        price: usd('10.00'),
        initialStock: qty('100'),
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
  };

  const issue = () =>
    makeIssueDeliveryNote({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('dn'),
    });

  const voidNote = (ctx = makeTestContext()) =>
    makeVoidDeliveryNote({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
    });

  beforeEach(setup);

  it('devuelve la mercancia al inventario', async () => {
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '10' }],
    });
    expect(product.onHand.toCompactString()).toBe('90');

    const result = await voidNote()({
      deliveryNoteId: issued.ok ? issued.value.id : '',
      reason: 'Cliente rechazo la mercancia',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.number).toBe('NE-000001');
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('deja constancia del motivo en la auditoria', async () => {
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '5' }],
    });
    await voidNote()({
      deliveryNoteId: issued.ok ? issued.value.id : '',
      reason: 'Error de captura en la cantidad',
    });

    const entry = audit.entries.find((e) => e.action === 'delivery_note.voided');
    expect(entry).toMatchObject({
      summary: { number: 'NE-000001', reason: 'Error de captura en la cantidad' },
    });
  });

  it('NO devuelve cuota mensual al anular', async () => {
    // Devolverla permitiria emitir y anular en bucle para saltarse el limite del plan.
    // El documento existio, se emitio y ocupo un correlativo.
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });
    expect(stores.usage.get(`${TENANT}:documents_month`)).toBe(1);

    await voidNote()({ deliveryNoteId: issued.ok ? issued.value.id : '', reason: 'Anulada' });
    expect(stores.usage.get(`${TENANT}:documents_month`)).toBe(1);
  });

  it('un vendedor NO puede anular, aunque si emitir', async () => {
    // Anular revierte stock y altera el historico: exige mas responsabilidad.
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });
    const ctx = makeTestContext({ actor: { userId: asId<UserId>('u'), role: 'sales' } });

    const result = await voidNote(ctx)({
      deliveryNoteId: issued.ok ? issued.value.id : '',
      reason: 'Intento',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
    expect(product.onHand.toCompactString()).toBe('99');
  });

  it('exige un motivo', async () => {
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '1' }],
    });

    const result = await voidNote()({
      deliveryNoteId: issued.ok ? issued.value.id : '',
      reason: '  ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Required');
    expect(product.onHand.toCompactString()).toBe('99');
  });

  it('no se puede anular dos veces', async () => {
    const issued = await issue()({
      customerId: 'cus-1',
      lines: [{ productId: product.id, quantity: '10' }],
    });
    const id = issued.ok ? issued.value.id : '';

    await voidNote()({ deliveryNoteId: id, reason: 'Primera anulacion' });
    const second = await voidNote()({ deliveryNoteId: id, reason: 'Segunda anulacion' });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe('InvalidTransition');
    // El stock NO se devuelve dos veces.
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('avisa si la nota no existe', async () => {
    const result = await voidNote()({ deliveryNoteId: 'fantasma', reason: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('DeliveryNoteNotFound');
  });
});
