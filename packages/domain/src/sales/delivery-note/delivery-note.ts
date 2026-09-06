import { ok, err, type Result } from '../../shared/result';
import type { ValidationError } from '../../shared/errors';
import {
  AggregateRoot,
  type CustomerId,
  type DeliveryNoteId,
  type ProductId,
  type TenantId,
  type UserId,
} from '../../shared/entity';
import { Money, type Currency } from '../../shared/value-objects/money';
import { type ExchangeRate } from '../../shared/value-objects/exchange-rate';
import { type Quantity, QUANTITY_SCALE } from '../../shared/value-objects/quantity';
import type { Product, ProductError } from '../../products/product';

/**
 * NOTA DE ENTREGA — documento interno NO FISCAL.
 *
 * Respalda la salida de mercancia y descuenta el inventario. No es un comprobante
 * tributario: el correlativo es interno y el impuesto que muestra es informativo.
 * Ver docs/adr/003-notas-de-entrega.md.
 *
 * Es el agregado con mas reglas del sistema, y donde de verdad se justifica la
 * arquitectura hexagonal.
 */

/**
 * Ciclo de vida.
 *
 *   borrador → emitida → entregada
 *                 ↓          ↓
 *              anulada    anulada
 *
 * Emitir descuenta stock. Anular lo devuelve mediante movimientos compensatorios, nunca
 * borrando los originales. Un documento entregado y anulado sigue existiendo: el
 * historico debe poder explicar que salio y que volvio.
 */
export type DeliveryNoteStatus = 'draft' | 'issued' | 'delivered' | 'voided';

const ALLOWED_TRANSITIONS: Readonly<Record<DeliveryNoteStatus, readonly DeliveryNoteStatus[]>> = {
  draft: ['issued', 'voided'],
  issued: ['delivered', 'voided'],
  delivered: ['voided'],
  voided: [],
};

export type DeliveryNoteError =
  | ValidationError
  | ProductError
  | { kind: 'NoLines' }
  | { kind: 'DuplicateProduct'; sku: string }
  | { kind: 'InvalidTransition'; from: DeliveryNoteStatus; to: DeliveryNoteStatus }
  | { kind: 'AlreadyIssued' }
  | { kind: 'NotIssued' }
  | { kind: 'DiscountOutOfRange'; basisPoints: number };

export interface DeliveryNoteLine {
  readonly lineNo: number;
  readonly productId: ProductId;
  /** Nombre y unidad congelados: renombrar un producto no reescribe documentos pasados. */
  readonly descriptionSnapshot: string;
  readonly unitSnapshot: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly discountBp: number;
  readonly taxable: boolean;
  readonly lineTotal: Money;
}

export interface DeliveryNoteTotals {
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  /** El mismo total convertido con la tasa congelada del documento. */
  readonly totalInSecondaryCurrency: Money;
}

interface DeliveryNoteProps {
  readonly tenantId: TenantId;
  readonly number: string;
  readonly customerId: CustomerId;
  readonly quoteId: string | null;
  readonly status: DeliveryNoteStatus;
  readonly currency: Currency;
  /** Tasa CONGELADA al emitir. Ver ADR 002: reconvertir despues reescribe el historico. */
  readonly exchangeRate: ExchangeRate;
  readonly taxLabelSnapshot: string;
  readonly taxRateBpSnapshot: number;
  readonly lines: readonly DeliveryNoteLine[];
  readonly totals: DeliveryNoteTotals;
  readonly issuedAt: Date | null;
  readonly issuedBy: UserId | null;
  readonly deliveredAt: Date | null;
  readonly receivedBy: string | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly notes: string | null;
}

/** Datos de una linea antes de convertirse en parte del documento. */
export interface DeliveryNoteLineInput {
  readonly product: Product;
  readonly quantity: Quantity;
  /** Si se omite, se toma el precio vigente del producto. */
  readonly unitPrice?: Money;
  /** Descuento en puntos basicos: 1000 = 10,00 %. */
  readonly discountBp?: number;
}

const MAX_DISCOUNT_BP = 10_000;

export class DeliveryNote extends AggregateRoot<DeliveryNoteId> {
  private constructor(
    id: DeliveryNoteId,
    private props: DeliveryNoteProps,
  ) {
    super(id);
  }

  /**
   * Emite la nota: valida, calcula totales y DESCUENTA el inventario.
   *
   * Es una sola operacion a proposito. Un metodo `create` seguido de un `issue` dejaria
   * abierta la posibilidad de un documento emitido cuyo stock no se descontó, que es
   * exactamente el estado inconsistente que este agregado existe para impedir.
   *
   * Los productos se reciben como agregados vivos —no como identificadores— porque hay
   * que mutarles el stock. El caso de uso los persiste despues en la misma transaccion.
   */
  static issue(input: {
    id: DeliveryNoteId;
    tenantId: TenantId;
    number: string;
    customerId: CustomerId;
    quoteId?: string | null;
    lines: readonly DeliveryNoteLineInput[];
    exchangeRate: ExchangeRate;
    currency: Currency;
    taxLabel: string;
    taxRateBp: number;
    issuedAt: Date;
    issuedBy: UserId;
    notes?: string | null;
  }): Result<DeliveryNote, DeliveryNoteError> {
    if (input.lines.length === 0) return err({ kind: 'NoLines' });

    // Un producto repetido casi siempre es un error de captura, y ademas descuadra el
    // stock de forma dificil de rastrear. Se rechaza en lugar de sumar cantidades en
    // silencio: agregarlas escondería el error del usuario.
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.product.id)) {
        return err({ kind: 'DuplicateProduct', sku: line.product.sku });
      }
      seen.add(line.product.id);
    }

    const built: DeliveryNoteLine[] = [];
    let lineNo = 0;

    for (const input_ of input.lines) {
      lineNo += 1;

      if (!input_.quantity.isPositive) {
        return err({ kind: 'OutOfRange', field: `lines[${lineNo}].quantity`, min: 0 });
      }

      const discountBp = input_.discountBp ?? 0;
      if (discountBp < 0 || discountBp > MAX_DISCOUNT_BP) {
        return err({ kind: 'DiscountOutOfRange', basisPoints: discountBp });
      }

      const unitPrice = input_.unitPrice ?? input_.product.price;
      if (unitPrice.currency !== input.currency) {
        return err({ kind: 'InvalidFormat', field: 'currency', expected: input.currency });
      }

      // Se redondea UNA sola vez, tras aplicar cantidad y descuento. Redondear en dos
      // pasos introduce desviaciones que se acumulan a lo largo del documento.
      const gross = unitPrice.multiplyScaled(input_.quantity.scaledValue, QUANTITY_SCALE);
      const lineTotal =
        discountBp > 0
          ? gross.subtract(gross.percentage(discountBp))
          : { ok: true as const, value: gross };
      if (!lineTotal.ok)
        return err({ kind: 'InvalidFormat', field: 'lineTotal', expected: 'Money' });

      built.push({
        lineNo,
        productId: input_.product.id,
        descriptionSnapshot: input_.product.name,
        unitSnapshot: input_.product.unit,
        quantity: input_.quantity,
        unitPrice,
        discountBp,
        taxable: input_.product.taxable,
        lineTotal: lineTotal.value,
      });
    }

    const totals = DeliveryNote.computeTotals(
      built,
      input.currency,
      input.taxRateBp,
      input.exchangeRate,
    );
    if (!totals.ok) return totals;

    // El stock se mueve en DOS pasadas, y el orden importa.
    //
    // Primero se comprueban TODAS las lineas sin tocar nada. Si se descontase sobre la
    // marcha, un fallo en la ultima linea dejaria las anteriores ya descontadas en
    // memoria: el rollback de la base de datos lo taparia, pero el agregado habria
    // quedado en un estado invalido por si mismo. Una invariante no puede depender de
    // que alguien mas la rescate.
    for (const line of input.lines) {
      const available = line.product.checkStockAvailable(line.quantity);
      if (!available.ok) return available;
    }

    // Solo ahora, con la certeza de que todas caben, se descuenta.
    for (const line of input.lines) {
      const removed = line.product.removeStock(line.quantity, input.issuedAt, {
        type: 'delivery_note',
        id: input.id,
      });
      // `StockNotTracked` no es un fallo: hay productos (servicios) que no llevan stock.
      if (!removed.ok && removed.error.kind !== 'StockNotTracked') {
        return removed;
      }
    }

    const note = new DeliveryNote(input.id, {
      tenantId: input.tenantId,
      number: input.number,
      customerId: input.customerId,
      quoteId: input.quoteId ?? null,
      status: 'issued',
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      taxLabelSnapshot: input.taxLabel,
      taxRateBpSnapshot: input.taxRateBp,
      lines: built,
      totals: totals.value,
      issuedAt: input.issuedAt,
      issuedBy: input.issuedBy,
      deliveredAt: null,
      receivedBy: null,
      voidedAt: null,
      voidReason: null,
      notes: input.notes?.trim() || null,
    });

    note.recordEvent({
      type: 'delivery_note.issued',
      occurredAt: input.issuedAt,
      tenantId: input.tenantId,
      payload: {
        deliveryNoteId: input.id,
        number: input.number,
        customerId: input.customerId,
        total: totals.value.total.toString(),
      },
    });

    return ok(note);
  }

  static rehydrate(id: DeliveryNoteId, props: DeliveryNoteProps): DeliveryNote {
    return new DeliveryNote(id, props);
  }

  private static computeTotals(
    lines: readonly DeliveryNoteLine[],
    currency: Currency,
    taxRateBp: number,
    rate: ExchangeRate,
  ): Result<DeliveryNoteTotals, DeliveryNoteError> {
    const subtotal = Money.sum(
      lines.map((l) => l.lineTotal),
      currency,
    );
    if (!subtotal.ok) return err({ kind: 'InvalidFormat', field: 'subtotal', expected: currency });

    // El impuesto informativo solo aplica a las lineas marcadas como gravables.
    const taxableBase = Money.sum(
      lines.filter((l) => l.taxable).map((l) => l.lineTotal),
      currency,
    );
    if (!taxableBase.ok) return err({ kind: 'InvalidFormat', field: 'tax', expected: currency });

    const tax = taxableBase.value.percentage(taxRateBp);
    const total = subtotal.value.add(tax);
    if (!total.ok) return err({ kind: 'InvalidFormat', field: 'total', expected: currency });

    const converted = rate.convert(total.value);
    if (!converted.ok) {
      return err({ kind: 'InvalidFormat', field: 'exchangeRate', expected: 'par convertible' });
    }

    return ok({
      subtotal: subtotal.value,
      tax,
      total: total.value,
      totalInSecondaryCurrency: converted.value,
    });
  }

  private canTransitionTo(next: DeliveryNoteStatus): boolean {
    return ALLOWED_TRANSITIONS[this.props.status].includes(next);
  }

  /** Confirma la recepcion por parte del cliente. */
  markDelivered(at: Date, receivedBy?: string | null): Result<void, DeliveryNoteError> {
    if (!this.canTransitionTo('delivered')) {
      return err({ kind: 'InvalidTransition', from: this.props.status, to: 'delivered' });
    }
    this.props = {
      ...this.props,
      status: 'delivered',
      deliveredAt: at,
      receivedBy: receivedBy?.trim() || null,
    };
    this.recordEvent({
      type: 'delivery_note.delivered',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: { deliveryNoteId: this.id, number: this.props.number },
    });
    return ok(undefined);
  }

  /**
   * Anula la nota y devuelve la mercancia al inventario.
   *
   * Exige motivo: anular un documento de venta es una operacion que alguien revisara
   * mas adelante, y "anulada" sin explicacion no dice nada. Los productos se reciben
   * vivos para generar sobre ellos los movimientos compensatorios.
   */
  void(
    reason: string,
    at: Date,
    products: ReadonlyMap<string, Product>,
  ): Result<void, DeliveryNoteError> {
    if (!this.canTransitionTo('voided')) {
      return err({ kind: 'InvalidTransition', from: this.props.status, to: 'voided' });
    }
    if (reason.trim().length === 0) return err({ kind: 'Required', field: 'reason' });

    for (const line of this.props.lines) {
      const product = products.get(line.productId);
      if (!product) continue;
      const compensated = product.compensateStock(line.quantity, at, {
        type: 'delivery_note_void',
        id: this.id,
      });
      if (!compensated.ok) return compensated;
    }

    this.props = { ...this.props, status: 'voided', voidedAt: at, voidReason: reason.trim() };
    this.recordEvent({
      type: 'delivery_note.voided',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: { deliveryNoteId: this.id, number: this.props.number, reason: reason.trim() },
    });
    return ok(undefined);
  }

  get number(): string {
    return this.props.number;
  }
  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get customerId(): CustomerId {
    return this.props.customerId;
  }
  get status(): DeliveryNoteStatus {
    return this.props.status;
  }
  get lines(): readonly DeliveryNoteLine[] {
    return this.props.lines;
  }
  get totals(): DeliveryNoteTotals {
    return this.props.totals;
  }
  get exchangeRate(): ExchangeRate {
    return this.props.exchangeRate;
  }
  get currency(): Currency {
    return this.props.currency;
  }
  get taxLabel(): string {
    return this.props.taxLabelSnapshot;
  }
  get issuedAt(): Date | null {
    return this.props.issuedAt;
  }
  get voidReason(): string | null {
    return this.props.voidReason;
  }
  get isVoided(): boolean {
    return this.props.status === 'voided';
  }

  /** Los identificadores de producto que toca este documento. Los usa el caso de uso al anular. */
  productIds(): readonly ProductId[] {
    return this.props.lines.map((l) => l.productId);
  }

  snapshot(): DeliveryNoteProps & { id: DeliveryNoteId } {
    return { id: this.id, ...this.props };
  }
}
