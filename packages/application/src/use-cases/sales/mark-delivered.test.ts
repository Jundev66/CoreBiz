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
import { makeMarkDelivered } from './mark-delivered';
import { makeVoidDeliveryNote } from './void-delivery-note';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('markDelivered', () => {
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

  const uow = () => new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit);

  const emitir = async () => {
    const r = await makeIssueDeliveryNote({
      uow: uow(),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('dn'),
    })({ customerId: 'cus-1', lines: [{ productId: product.id, quantity: '10' }] });
    if (!r.ok) throw new Error(`la emision fallo: ${JSON.stringify(r.error)}`);
    return r.value;
  };

  const entregar = (ctx = makeTestContext()) =>
    makeMarkDelivered({ uow: uow(), ctx, clock: fixedClock(NOW) });

  beforeEach(setup);

  it('confirma la entrega y guarda quien la recibio', async () => {
    const nota = await emitir();

    const result = await entregar()({
      deliveryNoteId: nota.id,
      receivedBy: 'Ana Rodriguez',
    });

    expect(result.ok).toBe(true);
    const guardada = stores.deliveryNotes.get(nota.id);
    expect(guardada?.status).toBe('delivered');
    expect(guardada?.snapshot().receivedBy).toBe('Ana Rodriguez');
    expect(guardada?.snapshot().deliveredAt).toEqual(NOW);
  });

  it('NO vuelve a tocar el inventario', async () => {
    // El stock salio al EMITIR, cuando la mercancia dejo el almacen. Restarlo tambien
    // aqui lo descontaria dos veces por una sola venta.
    const nota = await emitir();
    expect(product.onHand.toCompactString()).toBe('90');

    await entregar()({ deliveryNoteId: nota.id, receivedBy: null });

    expect(product.onHand.toCompactString()).toBe('90');
  });

  it('admite entregas sin firmante', async () => {
    // Una entrega en mostrador puede no tener a nadie que firme. Exigir un nombre
    // inventado seria peor que dejarlo vacio.
    const nota = await emitir();

    const result = await entregar()({ deliveryNoteId: nota.id, receivedBy: null });

    expect(result.ok).toBe(true);
    expect(stores.deliveryNotes.get(nota.id)?.snapshot().receivedBy).toBeNull();
  });

  it('ALMACEN si puede confirmar la entrega', async () => {
    // Es la unica operacion sobre un documento de venta que este rol puede hacer, y
    // tiene sentido: quien mueve las cajas es quien sabe que llegaron.
    const nota = await emitir();

    const result = await entregar(
      makeTestContext({
        actor: { userId: asId<UserId>('user-almacen'), role: 'warehouse' },
      }),
    )({ deliveryNoteId: nota.id, receivedBy: 'El encargado' });

    expect(result.ok).toBe(true);
  });

  it('un vendedor NO puede', async () => {
    const nota = await emitir();

    const result = await entregar(
      makeTestContext({
        actor: { userId: asId<UserId>('user-ventas'), role: 'sales' },
      }),
    )({ deliveryNoteId: nota.id, receivedBy: 'Quien sea' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
  });

  it('no se confirma dos veces', async () => {
    const nota = await emitir();
    await entregar()({ deliveryNoteId: nota.id, receivedBy: 'Primera vez' });

    const segunda = await entregar()({ deliveryNoteId: nota.id, receivedBy: 'Segunda vez' });

    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.kind).toBe('InvalidTransition');
  });

  it('una nota anulada ya no se puede entregar', async () => {
    const nota = await emitir();
    await makeVoidDeliveryNote({ uow: uow(), ctx: makeTestContext(), clock: fixedClock(NOW) })({
      deliveryNoteId: nota.id,
      reason: 'El cliente rechazo el pedido',
    });

    const result = await entregar()({ deliveryNoteId: nota.id, receivedBy: 'Nadie' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidTransition');
  });

  it('una nota entregada TODAVIA se puede anular', async () => {
    // La transicion `delivered -> voided` existe en el dominio y hasta ahora era
    // inalcanzable, porque no habia forma de llegar a `delivered`. Devolver mercancia
    // ya entregada es algo que pasa.
    const nota = await emitir();
    await entregar()({ deliveryNoteId: nota.id, receivedBy: 'Ana Rodriguez' });

    const anulada = await makeVoidDeliveryNote({
      uow: uow(),
      ctx: makeTestContext(),
      clock: fixedClock(NOW),
    })({ deliveryNoteId: nota.id, reason: 'Devolucion posterior a la entrega' });

    expect(anulada.ok).toBe(true);
    expect(stores.deliveryNotes.get(nota.id)?.status).toBe('voided');
    // Y el inventario vuelve, igual que anulando una emitida.
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('deja constancia en la auditoria', async () => {
    const nota = await emitir();

    await entregar()({ deliveryNoteId: nota.id, receivedBy: 'Ana Rodriguez' });

    const entry = audit.entries.find((e) => e.action === 'delivery_note.delivered');
    expect(entry).toMatchObject({ summary: { receivedBy: 'Ana Rodriguez' } });
  });

  it('avisa si la nota no existe', async () => {
    const result = await entregar()({ deliveryNoteId: 'no-existe', receivedBy: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('DeliveryNoteNotFound');
  });
});
