import { describe, it, expect } from 'vitest';
import { GoodsReceipt } from './goods-receipt';
import { Supplier } from './supplier';
import { Money } from '../shared/value-objects/money';
import { Quantity } from '../shared/value-objects/quantity';
import {
  asId,
  type ProductId,
  type SupplierId,
  type TenantId,
  type UserId,
} from '../shared/entity';
import { unwrap } from '../shared/result';

const TENANT = asId<TenantId>('tenant-test');
const SUPPLIER = asId<SupplierId>('sup-1');
const USER = asId<UserId>('user-1');
const AT = new Date('2026-09-07T10:00:00.000Z');

const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

function product(id: string, overrides: { trackStock?: boolean } = {}) {
  return {
    id: asId<ProductId>(id),
    name: `Producto ${id}`,
    unit: 'und',
    trackStock: overrides.trackStock ?? true,
  };
}

function receive(
  lines: readonly { product: ReturnType<typeof product>; quantity: string; unitCost: string }[],
) {
  return GoodsReceipt.receive({
    id: 'rec-1',
    tenantId: TENANT,
    number: 'RM-000001',
    supplierId: SUPPLIER,
    currency: 'USD',
    lines: lines.map((l) => ({
      product: l.product,
      quantity: qty(l.quantity),
      unitCost: usd(l.unitCost),
    })),
    receivedAt: AT,
    receivedBy: USER,
  });
}

describe('GoodsReceipt', () => {
  it('calcula el total redondeando UNA sola vez, tras aplicar la cantidad', () => {
    const result = receive([
      // 1,5 x 1,35 = 2,025. Redondeado una vez con HALF_UP da 2,03.
      { product: product('p1'), quantity: '1.5', unitCost: '1.35' },
      { product: product('p2'), quantity: '10', unitCost: '2.50' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // El redondeo ocurre al final, sobre el producto exacto de coste por
    // cantidad. Es lo mismo que hace la nota de entrega, y por la misma razon:
    // redondear en pasos intermedios acumula desviacion documento abajo.
    expect(result.value.lines[0]?.lineTotal.toString()).toBe('2.03');
    expect(result.value.total.toString()).toBe('27.03');
  });

  it('devuelve lo que hay que SUMAR al inventario, sin tocarlo', () => {
    const result = receive([
      { product: product('p1'), quantity: '12', unitCost: '1.00' },
      { product: product('p2'), quantity: '3.500', unitCost: '5.00' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // El documento NO mueve el saldo: lo declara. Quien lo mueve es Product,
    // que es el unico que conoce la politica de stock y genera el movimiento del
    // libro mayor. Si el documento tocara saldos habria dos sitios capaces de
    // descuadrar el inventario.
    const entries = result.value.stockEntries;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.quantity.toCompactString()).toBe('12');
    expect(entries[1]?.quantity.toCompactString()).toBe('3.5');
  });

  it('rechaza un documento sin lineas', () => {
    const result = receive([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NoLines');
  });

  it('rechaza el mismo producto repetido', () => {
    const p = product('p1');
    const result = receive([
      { product: p, quantity: '5', unitCost: '1.00' },
      { product: p, quantity: '3', unitCost: '1.00' },
    ]);

    // Sumarlo en silencio produciria una entrada del doble de lo que alguien
    // creia estar escribiendo, y el descuadre solo se ve al contar fisicamente.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('DuplicateProduct');
  });

  it('rechaza recibir algo que no lleva inventario', () => {
    const result = receive([
      { product: product('srv', { trackStock: false }), quantity: '1', unitCost: '8.00' },
    ]);

    // Un servicio no tiene existencias. Dejarlo pasar crearia una linea que no
    // mueve nada y un total que no cuadra con el inventario.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('StockNotTracked');
  });

  it('rechaza cantidades no positivas', () => {
    const result = receive([{ product: product('p1'), quantity: '0', unitCost: '1.00' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('OutOfRange');
  });

  it('rechaza un coste en otra moneda', () => {
    const result = GoodsReceipt.receive({
      id: 'rec-1',
      tenantId: TENANT,
      number: 'RM-000001',
      supplierId: SUPPLIER,
      currency: 'USD',
      lines: [
        { product: product('p1'), quantity: qty('1'), unitCost: unwrap(Money.of('10', 'VES')) },
      ],
      receivedAt: AT,
      receivedBy: USER,
    });

    // Un documento con dos monedas dentro no tiene un total que signifique algo.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidFormat');
  });

  it('al anular devuelve lo que hay que RESTAR y exige un motivo', () => {
    const created = receive([{ product: product('p1'), quantity: '10', unitCost: '2.00' }]);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const receipt = created.value;

    const sinMotivo = receipt.void('   ', AT);
    expect(sinMotivo.ok).toBe(false);
    if (!sinMotivo.ok) expect(sinMotivo.error.kind).toBe('Required');

    const anulada = receipt.void('Mercancia devuelta al proveedor', AT);
    expect(anulada.ok).toBe(true);
    if (anulada.ok) expect(anulada.value[0]?.quantity.toCompactString()).toBe('10');

    expect(receipt.isVoided).toBe(true);
    expect(receipt.voidReason).toBe('Mercancia devuelta al proveedor');

    // Anular dos veces restaria el inventario dos veces.
    const otraVez = receipt.void('Otra vez', AT);
    expect(otraVez.ok).toBe(false);
    if (!otraVez.ok) expect(otraVez.error.kind).toBe('AlreadyVoided');
  });

  it('emite el evento de recepcion con el total ya calculado', () => {
    const created = receive([{ product: product('p1'), quantity: '4', unitCost: '2.50' }]);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const events = created.value.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'goods_receipt.received',
      payload: { number: 'RM-000001', total: '10.00' },
    });
  });
});

describe('Supplier', () => {
  const create = (overrides: Partial<{ code: string; name: string; email: string | null }> = {}) =>
    Supplier.create({
      id: SUPPLIER,
      tenantId: TENANT,
      code: overrides.code ?? 'prv-001',
      name: overrides.name ?? 'Distribuidora Caribe',
      email: overrides.email ?? null,
      createdAt: AT,
    });

  it('normaliza el codigo a mayusculas', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.code).toBe('PRV-001');
  });

  it('rechaza un nombre demasiado corto', () => {
    const result = create({ name: 'A' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('TooShort');
  });

  it('rechaza un correo con forma invalida', () => {
    const result = create({ email: 'no-es-un-correo' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidFormat');
  });

  it('se archiva en lugar de borrarse', () => {
    const created = create();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    created.value.archive(AT);

    // Un proveedor con recepciones registradas no se puede borrar sin dejar el
    // historico de compras apuntando al vacio.
    expect(created.value.isArchived).toBe(true);
  });
});
