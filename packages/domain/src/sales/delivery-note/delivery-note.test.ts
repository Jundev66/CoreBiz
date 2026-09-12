import { describe, it, expect } from 'vitest';
import { DeliveryNote } from './delivery-note';
import { Product } from '../../products/product';
import { Money } from '../../shared/value-objects/money';
import { Quantity } from '../../shared/value-objects/quantity';
import { ExchangeRate } from '../../shared/value-objects/exchange-rate';
import { unwrap } from '../../shared/result';
import {
  asId,
  type CustomerId,
  type DeliveryNoteId,
  type ProductId,
  type TenantId,
  type UserId,
} from '../../shared/entity';

const TENANT = asId<TenantId>('t-1');
const CUSTOMER = asId<CustomerId>('c-1');
const USER = asId<UserId>('u-1');
const NOTE = asId<DeliveryNoteId>('dn-1');
const AT = new Date('2026-03-15T10:00:00.000Z');

const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));
const rate = (v: string, at: Date = AT) => unwrap(ExchangeRate.of(v, 'USD', 'VES', at));

const product = (opts: { sku?: string; price?: string; stock?: string; taxable?: boolean } = {}) =>
  unwrap(
    Product.create({
      id: asId<ProductId>(`p-${opts.sku ?? 'SKU-001'}`),
      tenantId: TENANT,
      sku: opts.sku ?? 'SKU-001',
      name: `Producto ${opts.sku ?? 'SKU-001'}`,
      price: usd(opts.price ?? '25.00'),
      initialStock: qty(opts.stock ?? '10'),
      taxable: opts.taxable ?? true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  );

const issue = (
  lines: Parameters<typeof DeliveryNote.issue>[0]['lines'],
  overrides: Partial<Parameters<typeof DeliveryNote.issue>[0]> = {},
) =>
  DeliveryNote.issue({
    id: NOTE,
    tenantId: TENANT,
    number: 'NE-000001',
    customerId: CUSTOMER,
    lines,
    exchangeRate: rate('36,50'),
    currency: 'USD',
    taxLabel: 'Impuesto informativo',
    taxRateBp: 1600,
    issuedAt: AT,
    issuedBy: USER,
    ...overrides,
  });

describe('DeliveryNote — emision', () => {
  it('emite y descuenta el inventario en el mismo acto', () => {
    const p = product({ stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('3') }]));

    expect(note.status).toBe('issued');
    expect(note.number).toBe('NE-000001');
    // 10 - 3 = 7: emitir y mover stock son la misma operacion, no dos.
    expect(p.onHand.toCompactString()).toBe('7');
  });

  it('registra el movimiento de salida con su referencia al documento', () => {
    const p = product({ stock: '10' });
    p.pullStockMovements();
    unwrap(issue([{ product: p, quantity: qty('3') }]));

    const movements = p.pullStockMovements();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      kind: 'out',
      refType: 'delivery_note',
      refId: NOTE,
    });
    expect(movements[0]?.balanceAfter.toCompactString()).toBe('7');
  });

  it('no emite nada si falta stock, y NO deja el inventario tocado', () => {
    const p = product({ stock: '10' });
    const result = issue([{ product: p, quantity: qty('50') }]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InsufficientStock');
      if (result.error.kind === 'InsufficientStock') {
        expect(result.error.available).toBe('10');
        expect(result.error.requested).toBe('50');
      }
    }
    expect(p.onHand.toCompactString()).toBe('10');
  });

  it('rechaza un documento sin lineas', () => {
    const result = issue([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NoLines');
  });

  it('rechaza el mismo producto repetido en vez de sumar cantidades en silencio', () => {
    // Agregar las cantidades escondería un error de captura del usuario.
    const p = product({ stock: '10' });
    const result = issue([
      { product: p, quantity: qty('1') },
      { product: p, quantity: qty('2') },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('DuplicateProduct');
  });

  it('rechaza cantidades no positivas', () => {
    const p = product();
    expect(issue([{ product: p, quantity: Quantity.zero() }]).ok).toBe(false);
  });

  it('rechaza descuentos fuera de rango', () => {
    const p = product();
    expect(issue([{ product: p, quantity: qty('1'), discountBp: -1 }]).ok).toBe(false);
    expect(issue([{ product: p, quantity: qty('1'), discountBp: 10_001 }]).ok).toBe(false);
    expect(issue([{ product: product(), quantity: qty('1'), discountBp: 10_000 }]).ok).toBe(true);
  });

  it('rejects a negative line price and accepts zero', () => {
    /*
     * `Money` allows negative amounts on purpose — it needs them to subtract — and the sign
     * was not checked here, so a mistyped `-5` issued a note with a NEGATIVE total that
     * also deducted stock. On Postgres a table constraint stopped it, i.e. the same mistake
     * ended in a 500.
     *
     * `Money.of('-5')` is still valid; what is rejected is using it as a price.
     */
    expect(issue([{ product: product(), quantity: qty('1'), unitPrice: usd('-5') }]).ok).toBe(
      false,
    );

    // Zero is fine: a free or sample line is legitimate.
    expect(issue([{ product: product(), quantity: qty('1'), unitPrice: usd('0') }]).ok).toBe(true);
  });

  it('congela nombre y unidad del producto en la linea', () => {
    const p = product();
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));

    p.rename('Nombre cambiado despues');

    // Renombrar el producto no debe reescribir documentos ya emitidos.
    expect(note.lines[0]?.descriptionSnapshot).toBe('Producto SKU-001');
  });
});

describe('DeliveryNote — totales', () => {
  it('calcula subtotal, impuesto informativo y total', () => {
    const p = product({ price: '25.00', stock: '100' });
    const note = unwrap(issue([{ product: p, quantity: qty('4') }]));

    // 4 x 25,00 = 100,00 ; 16 % = 16,00 ; total 116,00
    expect(note.totals.subtotal.toString()).toBe('100.00');
    expect(note.totals.tax.toString()).toBe('16.00');
    expect(note.totals.total.toString()).toBe('116.00');
  });

  it('aplica el descuento por linea antes del impuesto', () => {
    const p = product({ price: '100.00', stock: '100' });
    // 1 x 100,00 con 10 % de descuento = 90,00 ; 16 % = 14,40 ; total 104,40
    const note = unwrap(issue([{ product: p, quantity: qty('1'), discountBp: 1000 }]));

    expect(note.totals.subtotal.toString()).toBe('90.00');
    expect(note.totals.tax.toString()).toBe('14.40');
    expect(note.totals.total.toString()).toBe('104.40');
  });

  it('excluye del impuesto las lineas no gravables', () => {
    const gravable = product({ sku: 'A', price: '100.00', stock: '10', taxable: true });
    const exento = product({ sku: 'B', price: '100.00', stock: '10', taxable: false });

    const note = unwrap(
      issue([
        { product: gravable, quantity: qty('1') },
        { product: exento, quantity: qty('1') },
      ]),
    );

    expect(note.totals.subtotal.toString()).toBe('200.00');
    // Solo los 100,00 gravables pagan el 16 %.
    expect(note.totals.tax.toString()).toBe('16.00');
    expect(note.totals.total.toString()).toBe('216.00');
  });

  it('redondea una sola vez con cantidades fraccionarias', () => {
    const p = product({ price: '33.33', stock: '100' });
    // 2,5 x 33,33 = 83,325 -> 83,33 (una sola operacion de redondeo)
    const note = unwrap(issue([{ product: p, quantity: qty('2.5') }]));
    expect(note.totals.subtotal.toString()).toBe('83.33');
  });

  it('expresa el total tambien en la moneda secundaria', () => {
    const p = product({ price: '100.00', stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));

    // 116,00 USD x 36,50 = 4234,00 Bs
    expect(note.totals.totalInSecondaryCurrency.toString()).toBe('4234.00');
    expect(note.totals.totalInSecondaryCurrency.currency).toBe('VES');
  });
});

describe('DeliveryNote — la tasa queda congelada (invariante del negocio)', () => {
  it('una tasa nueva NO altera un documento ya emitido', () => {
    const p = product({ price: '100.00', stock: '100' });
    const enMarzo = unwrap(
      issue([{ product: p, quantity: qty('1') }], {
        exchangeRate: rate('36,50', new Date('2026-03-15T10:00:00.000Z')),
      }),
    );

    const totalOriginal = enMarzo.totals.totalInSecondaryCurrency.toString();

    // Meses despues el administrador actualiza la tasa del tenant.
    const p2 = product({ sku: 'SKU-002', price: '100.00', stock: '100' });
    const enSeptiembre = unwrap(
      issue([{ product: p2, quantity: qty('1') }], {
        id: asId<DeliveryNoteId>('dn-2'),
        exchangeRate: rate('54,20', new Date('2026-09-01T10:00:00.000Z')),
      }),
    );

    // El documento de marzo sigue valiendo lo mismo en bolivares.
    expect(enMarzo.totals.totalInSecondaryCurrency.toString()).toBe(totalOriginal);
    expect(totalOriginal).toBe('4234.00');
    expect(enSeptiembre.totals.totalInSecondaryCurrency.toString()).toBe('6287.20');
    expect(enMarzo.exchangeRate.toCompactString()).toBe('36.5');
  });
});

describe('DeliveryNote — ciclo de vida', () => {
  it('emitida se puede marcar como entregada', () => {
    const note = unwrap(issue([{ product: product(), quantity: qty('1') }]));
    const at = new Date('2026-03-16T10:00:00.000Z');

    expect(note.markDelivered(at, ' Maria Perez ').ok).toBe(true);
    expect(note.status).toBe('delivered');
  });

  it('no se puede entregar dos veces', () => {
    const note = unwrap(issue([{ product: product(), quantity: qty('1') }]));
    note.markDelivered(AT);

    const result = note.markDelivered(AT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidTransition');
  });

  it('anular devuelve la mercancia con un movimiento COMPENSATORIO', () => {
    const p = product({ stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('3') }]));
    p.pullStockMovements();

    const result = note.void('Cliente rechazo la mercancia', AT, new Map([[p.id, p]]));

    expect(result.ok).toBe(true);
    expect(note.status).toBe('voided');
    expect(p.onHand.toCompactString()).toBe('10');

    // El original NO se borra: se compensa, para que el historico siga siendo explicable.
    const movements = p.pullStockMovements();
    expect(movements).toHaveLength(1);
    expect(movements[0]?.kind).toBe('void_compensation');
  });

  it('anular exige un motivo', () => {
    const p = product();
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));

    const result = note.void('   ', AT, new Map([[p.id, p]]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('Required');
    expect(note.status).toBe('issued');
  });

  it('una nota entregada todavia se puede anular', () => {
    const p = product({ stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('2') }]));
    note.markDelivered(AT);

    expect(note.void('Devolucion total', AT, new Map([[p.id, p]])).ok).toBe(true);
    expect(p.onHand.toCompactString()).toBe('10');
  });

  it('una nota anulada ya no admite ninguna transicion', () => {
    const p = product();
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));
    note.void('Error de captura', AT, new Map([[p.id, p]]));

    expect(note.markDelivered(AT).ok).toBe(false);
    expect(note.void('Otra vez', AT, new Map([[p.id, p]])).ok).toBe(false);
  });

  it('emite los eventos de dominio de cada transicion', () => {
    const p = product({ stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));

    expect(note.pullDomainEvents()[0]).toMatchObject({ type: 'delivery_note.issued' });
    note.markDelivered(AT);
    expect(note.pullDomainEvents()[0]).toMatchObject({ type: 'delivery_note.delivered' });
    note.void('Devolucion', AT, new Map([[p.id, p]]));
    expect(note.pullDomainEvents()[0]).toMatchObject({ type: 'delivery_note.voided' });
  });
});

describe('DeliveryNote — vista del documento', () => {
  it('expone todo lo que la interfaz y el PDF necesitan sin abrir el agregado', () => {
    const p = product({ stock: '10' });
    const note = unwrap(issue([{ product: p, quantity: qty('2'), discountBp: 500 }]));

    expect(note.tenantId).toBe(TENANT);
    expect(note.customerId).toBe(CUSTOMER);
    expect(note.currency).toBe('USD');
    expect(note.taxLabel).toBe('Impuesto informativo');
    expect(note.issuedAt).toEqual(AT);
    expect(note.isVoided).toBe(false);
    expect(note.voidReason).toBeNull();
    expect(note.lines).toHaveLength(1);
    expect(note.lines[0]).toMatchObject({ lineNo: 1, discountBp: 500, unitSnapshot: 'und' });
    expect(note.productIds()).toEqual([p.id]);

    const snapshot = note.snapshot();
    expect(snapshot.id).toBe(NOTE);
    expect(snapshot.number).toBe('NE-000001');
    expect(snapshot.status).toBe('issued');
  });

  it('tras anular expone el motivo y la marca de anulacion', () => {
    const p = product();
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));
    note.void('Mercancia danada en transito', AT, new Map([[p.id, p]]));

    expect(note.isVoided).toBe(true);
    expect(note.voidReason).toBe('Mercancia danada en transito');
  });

  it('rehydrate reconstruye el documento sin eventos pendientes', () => {
    const p = product();
    const original = unwrap(issue([{ product: p, quantity: qty('1') }]));
    original.pullDomainEvents();

    const restored = DeliveryNote.rehydrate(original.id, original.snapshot());
    expect(restored.hasPendingEvents).toBe(false);
    expect(restored.number).toBe(original.number);
    expect(restored.totals.total.toString()).toBe(original.totals.total.toString());
  });

  it('anular ignora los productos que no se le pasan, sin romperse', () => {
    // El caso de uso carga solo los productos que aun existen; uno archivado y borrado
    // no puede impedir que el documento se anule.
    const p = product();
    const note = unwrap(issue([{ product: p, quantity: qty('1') }]));

    expect(note.void('Sin producto cargado', AT, new Map()).ok).toBe(true);
    expect(note.status).toBe('voided');
  });

  it('rechaza una linea cuya moneda no coincide con la del documento', () => {
    const p = product();
    const otherCurrency = unwrap(Money.of('10', 'VES'));
    const result = issue([{ product: p, quantity: qty('1'), unitPrice: otherCurrency }]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidFormat');
  });

  it('un producto sin control de stock no impide emitir (servicios)', () => {
    const servicio = unwrap(
      Product.create({
        id: asId<ProductId>('p-serv'),
        tenantId: TENANT,
        sku: 'SERV-01',
        name: 'Instalacion a domicilio',
        price: usd('40.00'),
        trackStock: false,
        createdAt: AT,
      }),
    );

    const note = issue([{ product: servicio, quantity: qty('1') }]);
    expect(note.ok).toBe(true);
  });
});
