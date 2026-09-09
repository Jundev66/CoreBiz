import { describe, it, expect } from 'vitest';
import { Product } from './product';
import { Money } from '../shared/value-objects/money';
import { Quantity } from '../shared/value-objects/quantity';
import { unwrap } from '../shared/result';
import { asId, type ProductId, type TenantId } from '../shared/entity';

const TENANT = asId<TenantId>('t-1');
const AT = new Date('2026-03-15T10:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

const make = (overrides: Partial<Parameters<typeof Product.create>[0]> = {}) =>
  Product.create({
    id: asId<ProductId>('p-1'),
    tenantId: TENANT,
    sku: 'sku-001',
    name: 'Harina de trigo 1kg',
    price: usd('2.50'),
    initialStock: qty('100'),
    createdAt: AT,
    ...overrides,
  });

describe('Product — creacion', () => {
  it('normaliza el SKU a mayusculas', () => {
    expect(unwrap(make()).sku).toBe('SKU-001');
  });

  it('usa "und" como unidad por defecto', () => {
    expect(unwrap(make()).unit).toBe('und');
    expect(unwrap(make({ unit: 'kg' })).unit).toBe('kg');
  });

  it('rechaza precio y costo negativos', () => {
    expect(make({ price: usd('-1') }).ok).toBe(false);
    expect(make({ cost: usd('-1') }).ok).toBe(false);
  });

  it('rechaza stock inicial negativo', () => {
    expect(make({ initialStock: qty('-5') }).ok).toBe(false);
  });

  it('exige nombre y SKU', () => {
    expect(make({ name: '  ' }).ok).toBe(false);
    expect(make({ sku: '  ' }).ok).toBe(false);
    expect(make({ name: 'A' }).ok).toBe(false);
    expect(make({ name: 'A'.repeat(161) }).ok).toBe(false);
    expect(make({ sku: 'S'.repeat(41) }).ok).toBe(false);
  });

  it('registra el inventario inicial como un movimiento, no como un saldo magico', () => {
    // Si el saldo arrancase sin movimiento, ningun asiento explicaria de donde salio.
    const p = unwrap(make({ initialStock: qty('100') }));
    const movements = p.pullStockMovements();

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ kind: 'in', refType: 'initial' });
    expect(movements[0]?.balanceAfter.toCompactString()).toBe('100');
  });

  it('un producto sin control de stock no genera movimiento inicial', () => {
    const p = unwrap(make({ trackStock: false, initialStock: qty('100') }));
    expect(p.pullStockMovements()).toHaveLength(0);
  });
});

describe('Product — salidas de inventario', () => {
  it('descuenta y deja el saldo correcto', () => {
    const p = unwrap(make({ initialStock: qty('100') }));
    expect(p.removeStock(qty('30'), AT).ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('70');
  });

  it('bloquea la salida que dejaria el stock negativo', () => {
    const p = unwrap(make({ initialStock: qty('10') }));
    const result = p.removeStock(qty('11'), AT);

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'InsufficientStock') {
      expect(result.error.available).toBe('10');
      expect(result.error.sku).toBe('SKU-001');
    }
    expect(p.onHand.toCompactString()).toBe('10');
  });

  it('permite el saldo negativo si el tenant lo autoriza expresamente', () => {
    // Hay comercios que despachan y regularizan despues; forzar lo contrario les
    // obligaria a inventar ajustes falsos.
    const p = unwrap(make({ initialStock: qty('10'), stockPolicy: 'allow_negative' }));
    expect(p.removeStock(qty('15'), AT).ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('-5');
  });

  it('rechaza cantidades no positivas', () => {
    const p = unwrap(make());
    expect(p.removeStock(Quantity.zero(), AT).ok).toBe(false);
    expect(p.addStock(Quantity.zero(), AT).ok).toBe(false);
  });

  it('avisa cuando el producto no lleva control de stock', () => {
    const p = unwrap(make({ trackStock: false }));
    const result = p.removeStock(qty('1'), AT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('StockNotTracked');
  });
});

describe('Product — entradas y ajustes', () => {
  it('suma entradas de mercancia', () => {
    const p = unwrap(make({ initialStock: qty('10') }));
    expect(p.addStock(qty('25'), AT, { type: 'purchase_order', id: 'po-1' }).ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('35');
  });

  it('el ajuste exige motivo, para que una auditoria posterior pueda explicarlo', () => {
    const p = unwrap(make({ initialStock: qty('100') }));
    const result = p.adjustStock(qty('95'), '   ', AT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Required');
    expect(p.onHand.toCompactString()).toBe('100');
  });

  it('el ajuste registra la diferencia, no el saldo nuevo', () => {
    const p = unwrap(make({ initialStock: qty('100') }));
    p.pullStockMovements();

    expect(p.adjustStock(qty('95'), 'Conteo fisico: merma', AT).ok).toBe(true);
    const movements = p.pullStockMovements();

    expect(movements[0]?.kind).toBe('adjust');
    expect(movements[0]?.quantity.toCompactString()).toBe('-5');
    expect(movements[0]?.balanceAfter.toCompactString()).toBe('95');
    expect(movements[0]?.note).toBe('Conteo fisico: merma');
  });

  it('un ajuste que no cambia nada no genera movimiento', () => {
    const p = unwrap(make({ initialStock: qty('100') }));
    p.pullStockMovements();
    expect(p.adjustStock(qty('100'), 'Conteo sin diferencias', AT).ok).toBe(true);
    expect(p.pullStockMovements()).toHaveLength(0);
  });

  it('rechaza un ajuste a negativo bajo la politica estricta', () => {
    const p = unwrap(make({ initialStock: qty('10') }));
    expect(p.adjustStock(qty('-1'), 'Motivo', AT).ok).toBe(false);
  });
});

describe('Product — alertas y modificacion', () => {
  it('avisa cuando el saldo baja del minimo', () => {
    const p = unwrap(make({ initialStock: qty('10'), minStock: qty('5') }));
    expect(p.isBelowMinimum).toBe(false);

    p.removeStock(qty('6'), AT);
    expect(p.isBelowMinimum).toBe(true);
  });

  it('sin minimo definido nunca esta bajo minimos', () => {
    const p = unwrap(make({ initialStock: qty('0') }));
    expect(p.isBelowMinimum).toBe(false);
  });

  it('cambia el precio validando que no sea negativo', () => {
    const p = unwrap(make());
    expect(p.changePrice(usd('3.75')).ok).toBe(true);
    expect(p.price.toString()).toBe('3.75');
    expect(p.changePrice(usd('-1')).ok).toBe(false);
    expect(p.price.toString()).toBe('3.75');
  });

  it('renombra validando longitud', () => {
    const p = unwrap(make());
    expect(p.rename('Harina premium 1kg').ok).toBe(true);
    expect(p.rename('A').ok).toBe(false);
    expect(p.rename('A'.repeat(200)).ok).toBe(false);
  });

  it('archiva y emite el evento una sola vez', () => {
    const p = unwrap(make());
    p.pullDomainEvents();

    p.archive(AT);
    expect(p.isArchived).toBe(true);
    expect(p.pullDomainEvents()).toHaveLength(1);

    p.archive(AT);
    expect(p.pullDomainEvents()).toHaveLength(0);
  });

  it('rehydrate reconstruye sin eventos pendientes', () => {
    const original = unwrap(make());
    original.pullDomainEvents();
    const restored = Product.rehydrate(original.id, original.snapshot());

    expect(restored.hasPendingEvents).toBe(false);
    expect(restored.sku).toBe('SKU-001');
    expect(restored.onHand.toCompactString()).toBe('100');
  });

  it('compensar sobre un producto sin stock controlado no hace nada y no falla', () => {
    const p = unwrap(make({ trackStock: false }));
    expect(p.compensateStock(qty('5'), AT, { type: 'x', id: 'y' }).ok).toBe(true);
  });

  // ── Revertir una entrada: anular una recepcion de compra ────────────────────

  it('revertir una entrada resta del saldo y lo registra como compensacion', () => {
    const p = unwrap(make({ initialStock: qty('100') }));
    p.pullStockMovements();

    const revertido = p.reverseStockEntry(qty('30'), AT, { type: 'goods_receipt', id: 'r-1' });

    expect(revertido.ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('70');

    const [movimiento] = p.pullStockMovements();
    // El tipo importa: registrado como `out` pareceria un despacho, y deshacer una
    // compra no es vender.
    expect(movimiento?.kind).toBe('void_compensation');
    expect(movimiento?.quantity.toCompactString()).toBe('-30');
    expect(movimiento?.balanceAfter.toCompactString()).toBe('70');
  });

  it('NO deja revertir una entrada cuya mercancia ya se vendio', () => {
    const p = unwrap(make({ initialStock: qty('10') }));

    // Se recibieron 10 y se despacharon 8: quedan 2. Anular la recepcion pediria
    // quitar 10, y no se puede fingir que nunca llego algo que ya salio.
    expect(unwrap2(p.removeStock(qty('8'), AT))).toBe(undefined);

    const revertido = p.reverseStockEntry(qty('10'), AT, { type: 'goods_receipt', id: 'r-1' });

    expect(revertido.ok).toBe(false);
    if (!revertido.ok) expect(revertido.error.kind).toBe('InsufficientStock');
    // Y el saldo no se toca: o la operacion entera, o nada.
    expect(p.onHand.toCompactString()).toBe('2');
  });

  it('con la politica permisiva si deja el saldo en negativo', () => {
    const p = unwrap(make({ initialStock: qty('5'), stockPolicy: 'allow_negative' }));

    const revertido = p.reverseStockEntry(qty('8'), AT, { type: 'goods_receipt', id: 'r-1' });

    expect(revertido.ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('-3');
  });

  it('revertir sobre un producto sin stock controlado no hace nada y no falla', () => {
    const p = unwrap(make({ trackStock: false }));
    expect(p.reverseStockEntry(qty('5'), AT, { type: 'x', id: 'y' }).ok).toBe(true);
  });
});

/** `unwrap` para un Result<void, E>: devuelve undefined y lanza si vino en error. */
function unwrap2(r: { ok: boolean }): undefined {
  if (!r.ok) throw new Error('se esperaba ok');
  return undefined;
}
