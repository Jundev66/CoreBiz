import { describe, it, expect, beforeEach } from 'vitest';
import {
  Money,
  Plan,
  Product,
  Quantity,
  Supplier,
  asId,
  unwrap,
  type ProductId,
  type UserId,
  type SupplierId,
  type TenantId,
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
import { makeReceiveGoods } from './receive-goods';
import { makeVoidGoodsReceipt } from './void-goods-receipt';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('voidGoodsReceipt', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;
  let product: Product;

  const setup = () => {
    stores = createSalesStores();
    audit = new InMemoryAuditLogger(TENANT);

    const supplier = unwrap(
      Supplier.create({
        id: asId<SupplierId>('sup-1'),
        tenantId: TENANT,
        code: 'PRV-001',
        name: 'Distribuidora Central',
        createdAt: NOW,
      }),
    );
    stores.suppliers.set(supplier.id, supplier);

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

  const receive = () =>
    makeReceiveGoods({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx: makeTestContext({ plan: Plan.of('pro') }),
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('gr'),
    });

  const voidReceipt = (ctx = makeTestContext({ plan: Plan.of('pro') })) =>
    makeVoidGoodsReceipt({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
    });

  const recibir = async (cantidad: string) => {
    const r = await receive()({
      supplierId: 'sup-1',
      lines: [{ productId: product.id, quantity: cantidad, unitCost: '6.00' }],
    });
    if (!r.ok) throw new Error(`la recepcion fallo: ${JSON.stringify(r.error)}`);
    return r.value;
  };

  beforeEach(setup);

  it('quita del inventario lo que habia entrado', async () => {
    const recibido = await recibir('20');
    expect(product.onHand.toCompactString()).toBe('120');

    const result = await voidReceipt()({
      goodsReceiptId: recibido.id,
      reason: 'La mercancia llego danada y se devolvio',
    });

    expect(result.ok).toBe(true);
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('lo registra como compensacion, no como una salida', async () => {
    // En el libro mayor, deshacer una compra tiene que poder distinguirse de una venta.
    const recibido = await recibir('20');

    await voidReceipt()({ goodsReceiptId: recibido.id, reason: 'Devuelta al proveedor' });

    // Se lee del LIBRO, no del agregado: al guardar, el repositorio consume los
    // movimientos pendientes y los escribe — igual que hace el adaptador real. Preguntarle
    // al producto despues de guardar devuelve una lista vacia, que es correcto y no dice
    // nada.
    const movimiento = stores.stockMovements.at(-1);
    expect(movimiento?.kind).toBe('void_compensation');
    expect(movimiento?.quantity).toBe('-20');
  });

  it('NO deja anular si la mercancia recibida ya se vendio', async () => {
    // Este es el caso que separa anular una compra de anular una venta. Devolver al
    // inventario lo que salio siempre se puede; quitar lo que entro, no — si ya salio por
    // la puerta, fingir que nunca llego dejaria el saldo mintiendo.
    const recibido = await recibir('20');
    unwrap(product.removeStock(qty('115'), NOW));
    expect(product.onHand.toCompactString()).toBe('5');

    const result = await voidReceipt()({
      goodsReceiptId: recibido.id,
      reason: 'Intento de anulacion tardia',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InsufficientStock');
  });

  it('exige un motivo', async () => {
    const recibido = await recibir('10');

    const result = await voidReceipt()({ goodsReceiptId: recibido.id, reason: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Required');
  });

  it('no se puede anular dos veces', async () => {
    const recibido = await recibir('10');
    await voidReceipt()({ goodsReceiptId: recibido.id, reason: 'Primera anulacion' });

    const segunda = await voidReceipt()({
      goodsReceiptId: recibido.id,
      reason: 'Segunda anulacion',
    });

    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.kind).toBe('AlreadyVoided');
    // Y el inventario solo se descuenta una vez.
    expect(product.onHand.toCompactString()).toBe('100');
  });

  it('almacen puede RECIBIR pero no anular', async () => {
    // La misma separacion que en ventas: quien mueve cajas no deshace documentos.
    const recibido = await recibir('10');

    const result = await voidReceipt(
      makeTestContext({
        actor: { userId: asId<UserId>('user-almacen'), role: 'warehouse' },
        plan: Plan.of('pro'),
      }),
    )({
      goodsReceiptId: recibido.id,
      reason: 'No deberia poder',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Forbidden');
  });

  it('deja constancia del motivo en la auditoria', async () => {
    const recibido = await recibir('10');

    await voidReceipt()({
      goodsReceiptId: recibido.id,
      reason: 'Documento del proveedor duplicado',
    });

    const entry = audit.entries.find((e) => e.action === 'goods_receipt.voided');
    expect(entry).toMatchObject({ summary: { reason: 'Documento del proveedor duplicado' } });
  });

  it('avisa si la recepcion no existe', async () => {
    const result = await voidReceipt()({
      goodsReceiptId: 'no-existe',
      reason: 'Da igual el motivo',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('GoodsReceiptNotFound');
  });
});
