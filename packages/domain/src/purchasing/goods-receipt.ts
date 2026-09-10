import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import {
  AggregateRoot,
  type ProductId,
  type SupplierId,
  type TenantId,
  type UserId,
} from '../shared/entity';
import { Money, type Currency } from '../shared/value-objects/money';
import { QUANTITY_SCALE, type Quantity } from '../shared/value-objects/quantity';

/**
 * Recepcion de mercancia.
 *
 * Es el reverso exacto de la nota de entrega, y por eso comparte su forma: un
 * documento con lineas, con un correlativo propio, que al confirmarse mueve el
 * inventario y despues queda congelado.
 *
 * Lo que hace este agregado y lo que NO hace, dicho en voz alta:
 *
 *   - SI decide que una recepcion es valida, cuanto entra de cada producto y que
 *     coste queda registrado.
 *   - NO toca el saldo de los productos. Devuelve las lineas y es el caso de uso
 *     quien llama a `product.addStock()` sobre cada agregado Product. El
 *     inventario pertenece a Product y solo el puede moverlo; si esta clase
 *     escribiera saldos directamente, habria dos sitios capaces de descuadrarlo.
 *
 * El coste se guarda por linea y no se propaga al producto automaticamente.
 * Recalcular el coste medio en cada recepcion es una decision contable —FIFO,
 * medio ponderado, ultimo coste— que un comercio pequeno no ha tomado, y elegir
 * por el en silencio le cambiaria los margenes sin avisar. Queda registrado el
 * dato; que hacer con el es una decision posterior.
 */

/**
 * Solo dos estados, y el que falta importa.
 *
 * NO hay `draft`. Se declaraba y ningun constructor lo producia, asi que su unico
 * efecto era obligar a comprobarlo en sitios donde nunca podia darse. Y conceptualmente
 * sobra: un borrador de recepcion es una ORDEN DE COMPRA —mercancia que se espera— y eso
 * es otro documento. Una recepcion existe porque la mercancia ya llego.
 */
export type GoodsReceiptStatus = 'received' | 'voided';

export type GoodsReceiptError =
  | ValidationError
  | { kind: 'NoLines' }
  | { kind: 'DuplicateProduct'; sku: string }
  | { kind: 'StockNotTracked'; sku: string }
  | { kind: 'AlreadyVoided' };

export interface GoodsReceiptLine {
  readonly lineNo: number;
  readonly productId: ProductId;
  readonly descriptionSnapshot: string;
  readonly unitSnapshot: string;
  readonly quantity: Quantity;
  /** Coste unitario acordado con el proveedor. Puede diferir del coste del catalogo. */
  readonly unitCost: Money;
  readonly lineTotal: Money;
}

export interface GoodsReceiptProps {
  readonly tenantId: TenantId;
  readonly number: string;
  readonly supplierId: SupplierId;
  readonly status: GoodsReceiptStatus;
  readonly currency: Currency;
  readonly lines: readonly GoodsReceiptLine[];
  readonly total: Money;
  /** Referencia del documento del proveedor. Texto libre: cada uno numera a su manera. */
  readonly supplierReference: string | null;
  readonly notes: string | null;
  readonly receivedAt: Date | null;
  readonly receivedBy: UserId | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
}

/** Lo que hay que mover en el inventario por causa de esta recepcion. */
export interface StockEntry {
  readonly productId: ProductId;
  readonly quantity: Quantity;
}

const LINE_MAX = 200;

export class GoodsReceipt extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: GoodsReceiptProps,
  ) {
    super(id);
  }

  /**
   * Registra la recepcion, ya confirmada.
   *
   * No hay estado `draft` que confirmar despues, y es deliberado: recibir
   * mercancia es un hecho que ya ocurrio cuando alguien lo escribe. Un borrador
   * de "voy a recibir esto" es una ORDEN DE COMPRA, que es otro documento con
   * otro ciclo de vida.
   */
  static receive(input: {
    id: string;
    tenantId: TenantId;
    number: string;
    supplierId: SupplierId;
    currency: Currency;
    lines: readonly {
      product: { id: ProductId; name: string; unit: string; trackStock: boolean };
      quantity: Quantity;
      unitCost: Money;
    }[];
    supplierReference?: string | null;
    notes?: string | null;
    receivedAt: Date;
    receivedBy: UserId;
  }): Result<GoodsReceipt, GoodsReceiptError> {
    if (input.lines.length === 0) return err({ kind: 'NoLines' });
    if (input.lines.length > LINE_MAX) {
      return err({ kind: 'TooLong', field: 'lines', max: LINE_MAX });
    }

    const built: GoodsReceiptLine[] = [];
    const seen = new Set<string>();
    let lineNo = 0;

    for (const line of input.lines) {
      lineNo += 1;

      // Un producto repetido en el mismo documento casi siempre es un error de
      // captura, y sumarlo en silencio produce una entrada del doble de lo que
      // alguien creia estar escribiendo.
      if (seen.has(line.product.id)) {
        return err({ kind: 'DuplicateProduct', sku: line.product.name });
      }
      seen.add(line.product.id);

      // Un servicio no tiene existencias, asi que no se puede "recibir". Dejarlo
      // pasar crearia una linea que no mueve nada y un total que no cuadra con
      // el inventario.
      if (!line.product.trackStock) {
        return err({ kind: 'StockNotTracked', sku: line.product.name });
      }

      if (!line.quantity.isPositive) {
        return err({ kind: 'OutOfRange', field: 'quantity', min: 0 });
      }
      if (line.unitCost.currency !== input.currency) {
        return err({ kind: 'InvalidFormat', field: 'currency', expected: input.currency });
      }
      if (line.unitCost.isNegative) {
        return err({ kind: 'OutOfRange', field: 'unitCost', min: 0 });
      }

      // Se redondea UNA sola vez, igual que en la nota de entrega. Redondear en
      // dos pasos acumula desviacion documento abajo.
      const lineTotal = line.unitCost.multiplyScaled(line.quantity.scaledValue, QUANTITY_SCALE);

      built.push({
        lineNo,
        productId: line.product.id,
        descriptionSnapshot: line.product.name,
        unitSnapshot: line.product.unit,
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineTotal,
      });
    }

    const total = Money.sum(
      built.map((l) => l.lineTotal),
      input.currency,
    );
    if (!total.ok) return err({ kind: 'InvalidFormat', field: 'total', expected: input.currency });

    const receipt = new GoodsReceipt(input.id, {
      tenantId: input.tenantId,
      number: input.number,
      supplierId: input.supplierId,
      status: 'received',
      currency: input.currency,
      lines: built,
      total: total.value,
      supplierReference: input.supplierReference?.trim() || null,
      notes: input.notes?.trim() || null,
      receivedAt: input.receivedAt,
      receivedBy: input.receivedBy,
      voidedAt: null,
      voidReason: null,
    });

    receipt.recordEvent({
      type: 'goods_receipt.received',
      occurredAt: input.receivedAt,
      tenantId: input.tenantId,
      payload: {
        goodsReceiptId: input.id,
        number: input.number,
        supplierId: input.supplierId,
        total: total.value.toString(),
      },
    });

    return ok(receipt);
  }

  static rehydrate(id: string, props: GoodsReceiptProps): GoodsReceipt {
    return new GoodsReceipt(id, props);
  }

  /**
   * Lo que hay que SUMAR al inventario por esta recepcion.
   *
   * Devolver las entradas en lugar de aplicarlas es lo que mantiene el inventario
   * en un solo sitio. El caso de uso las recorre llamando a `product.addStock()`,
   * que es quien conoce la politica de stock y genera el movimiento del libro
   * mayor. Ver el mismo patron en `DeliveryNote`.
   */
  get stockEntries(): readonly StockEntry[] {
    return this.props.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    }));
  }

  /**
   * Anula la recepcion.
   *
   * Devuelve lo que hay que RESTAR del inventario. La compensacion se registra
   * como movimiento propio, nunca borrando la entrada original: el historico
   * tiene que poder explicar que entro y que se devolvio, no fingir que nunca
   * paso.
   */
  void(reason: string, at: Date): Result<readonly StockEntry[], GoodsReceiptError> {
    if (this.props.status === 'voided') return err({ kind: 'AlreadyVoided' });
    if (reason.trim().length === 0) return err({ kind: 'Required', field: 'reason' });

    this.props = {
      ...this.props,
      status: 'voided',
      voidedAt: at,
      voidReason: reason.trim(),
    };

    this.recordEvent({
      type: 'goods_receipt.voided',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: { goodsReceiptId: this.id, number: this.props.number, reason: reason.trim() },
    });

    return ok(this.stockEntries);
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get number(): string {
    return this.props.number;
  }
  get supplierId(): SupplierId {
    return this.props.supplierId;
  }
  get status(): GoodsReceiptStatus {
    return this.props.status;
  }
  get currency(): Currency {
    return this.props.currency;
  }
  get lines(): readonly GoodsReceiptLine[] {
    return this.props.lines;
  }
  get total(): Money {
    return this.props.total;
  }
  get receivedAt(): Date | null {
    return this.props.receivedAt;
  }
  get voidReason(): string | null {
    return this.props.voidReason;
  }
  get isVoided(): boolean {
    return this.props.status === 'voided';
  }
  get snapshot(): GoodsReceiptProps {
    return this.props;
  }
}
