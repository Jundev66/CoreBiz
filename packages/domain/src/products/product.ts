import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type ProductId, type TenantId } from '../shared/entity';
import { type Money } from '../shared/value-objects/money';
import { Quantity } from '../shared/value-objects/quantity';

/**
 * Producto del catalogo, con su saldo de inventario.
 *
 * Aqui si hay invariantes reales, a diferencia de `Customer`: el stock no puede quedar
 * negativo si el tenant no lo permite, y el saldo solo cambia a traves de movimientos
 * que quedan registrados. Nadie "fija" el stock a un valor: se declara un movimiento y
 * el saldo se deriva de el.
 */

export type StockPolicy = 'deny_negative' | 'allow_negative';

export type ProductError =
  | ValidationError
  | { kind: 'InsufficientStock'; sku: string; requested: string; available: string }
  | { kind: 'StockNotTracked'; sku: string };

/** Movimiento de inventario. Es un hecho ocurrido: nunca se edita ni se borra. */
export interface StockMovement {
  readonly kind: 'in' | 'out' | 'adjust' | 'void_compensation';
  readonly quantity: Quantity;
  readonly balanceAfter: Quantity;
  readonly refType: string | null;
  readonly refId: string | null;
  readonly note: string | null;
  readonly occurredAt: Date;
}

/**
 * Estado interno del agregado.
 *
 * Se exporta porque es el argumento de `rehydrate()`, y quien reconstruye el
 * agregado desde la base de datos vive fuera del dominio. No es una invitacion a
 * construirlo a mano: crear un Product valido sigue pasando por `create()`.
 */
export interface ProductProps {
  readonly tenantId: TenantId;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly unit: string;
  readonly price: Money;
  readonly cost: Money | null;
  readonly taxable: boolean;
  readonly trackStock: boolean;
  readonly onHand: Quantity;
  readonly minStock: Quantity | null;
  readonly stockPolicy: StockPolicy;
  readonly archivedAt: Date | null;
}

const NAME_MIN = 2;
const NAME_MAX = 160;
const SKU_MAX = 40;

export class Product extends AggregateRoot<ProductId> {
  private pendingMovements: StockMovement[] = [];

  private constructor(
    id: ProductId,
    private props: ProductProps,
  ) {
    super(id);
  }

  static create(input: {
    id: ProductId;
    tenantId: TenantId;
    sku: string;
    name: string;
    price: Money;
    unit?: string;
    description?: string | null;
    cost?: Money | null;
    taxable?: boolean;
    trackStock?: boolean;
    initialStock?: Quantity;
    minStock?: Quantity | null;
    stockPolicy?: StockPolicy;
    createdAt: Date;
  }): Result<Product, ProductError> {
    const name = input.name.trim();
    if (name.length === 0) return err({ kind: 'Required', field: 'name' });
    if (name.length < NAME_MIN) return err({ kind: 'TooShort', field: 'name', min: NAME_MIN });
    if (name.length > NAME_MAX) return err({ kind: 'TooLong', field: 'name', max: NAME_MAX });

    const sku = input.sku.trim().toUpperCase();
    if (sku.length === 0) return err({ kind: 'Required', field: 'sku' });
    if (sku.length > SKU_MAX) return err({ kind: 'TooLong', field: 'sku', max: SKU_MAX });

    // Un precio negativo no es un descuento: es un dato corrupto que se propagaria a
    // todos los totales que lo usen.
    if (input.price.isNegative) return err({ kind: 'OutOfRange', field: 'price', min: 0 });
    if (input.cost?.isNegative) return err({ kind: 'OutOfRange', field: 'cost', min: 0 });

    const initialStock = input.initialStock ?? Quantity.zero();
    if (initialStock.isNegative) {
      return err({ kind: 'OutOfRange', field: 'initialStock', min: 0 });
    }

    const product = new Product(input.id, {
      tenantId: input.tenantId,
      sku,
      name,
      description: input.description?.trim() || null,
      unit: input.unit?.trim() || 'und',
      price: input.price,
      cost: input.cost ?? null,
      taxable: input.taxable ?? true,
      trackStock: input.trackStock ?? true,
      onHand: initialStock,
      minStock: input.minStock ?? null,
      stockPolicy: input.stockPolicy ?? 'deny_negative',
      archivedAt: null,
    });

    // El inventario inicial tambien es un movimiento: si no lo fuese, el saldo
    // arrancaria en un valor que ningun asiento explica.
    if (input.trackStock !== false && initialStock.isPositive) {
      product.pendingMovements.push({
        kind: 'in',
        quantity: initialStock,
        balanceAfter: initialStock,
        refType: 'initial',
        refId: null,
        note: 'Inventario inicial',
        occurredAt: input.createdAt,
      });
    }

    product.recordEvent({
      type: 'product.created',
      occurredAt: input.createdAt,
      tenantId: input.tenantId,
      payload: { productId: input.id, sku, name },
    });

    return ok(product);
  }

  static rehydrate(id: ProductId, props: ProductProps): Product {
    return new Product(id, props);
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get sku(): string {
    return this.props.sku;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get unit(): string {
    return this.props.unit;
  }
  get price(): Money {
    return this.props.price;
  }
  get cost(): Money | null {
    return this.props.cost;
  }
  get taxable(): boolean {
    return this.props.taxable;
  }
  get trackStock(): boolean {
    return this.props.trackStock;
  }
  get onHand(): Quantity {
    return this.props.onHand;
  }
  get minStock(): Quantity | null {
    return this.props.minStock;
  }
  get isArchived(): boolean {
    return this.props.archivedAt !== null;
  }

  /** Avisa de reposicion. Un producto sin minimo definido nunca esta bajo minimos. */
  get isBelowMinimum(): boolean {
    if (!this.props.trackStock || this.props.minStock === null) return false;
    return this.props.onHand.isLessThan(this.props.minStock);
  }

  /**
   * Comprueba si hay existencias suficientes SIN tocar el inventario.
   *
   * Existe para que quien deba descontar varias lineas pueda validarlas todas antes de
   * mover nada. Sin esta separacion, un fallo en la ultima linea deja las anteriores ya
   * descontadas en memoria, y el agregado queda en un estado que solo el rollback de la
   * base de datos salvaria. Una invariante no puede depender de eso.
   */
  checkStockAvailable(quantity: Quantity): Result<void, ProductError> {
    if (!this.props.trackStock) return ok(undefined);
    if (!quantity.isPositive) {
      return err({ kind: 'OutOfRange', field: 'quantity', min: 0 });
    }
    if (this.props.stockPolicy === 'allow_negative') return ok(undefined);

    if (quantity.isGreaterThan(this.props.onHand)) {
      return err({
        kind: 'InsufficientStock',
        sku: this.props.sku,
        requested: quantity.toCompactString(),
        available: this.props.onHand.toCompactString(),
      });
    }
    return ok(undefined);
  }

  /**
   * Saca mercancia del inventario.
   *
   * Es la operacion que ejecuta una nota de entrega al emitirse. Devuelve error en lugar
   * de dejar el saldo en negativo, salvo que el tenant lo permita expresamente: hay
   * comercios que despachan y regularizan despues, y forzarles lo contrario les obliga
   * a inventar ajustes falsos.
   */
  removeStock(
    quantity: Quantity,
    at: Date,
    ref: { type: string; id: string } | null = null,
  ): Result<void, ProductError> {
    if (!this.props.trackStock) {
      return err({ kind: 'StockNotTracked', sku: this.props.sku });
    }
    if (!quantity.isPositive) {
      return err({ kind: 'OutOfRange', field: 'quantity', min: 0 });
    }

    const balanceAfter = this.props.onHand.subtract(quantity);
    if (balanceAfter.isNegative && this.props.stockPolicy === 'deny_negative') {
      return err({
        kind: 'InsufficientStock',
        sku: this.props.sku,
        requested: quantity.toCompactString(),
        available: this.props.onHand.toCompactString(),
      });
    }

    this.applyMovement('out', quantity.negate(), balanceAfter, at, ref, null);
    return ok(undefined);
  }

  /** Entrada de mercancia: recepcion de compra o devolucion de cliente. */
  addStock(
    quantity: Quantity,
    at: Date,
    ref: { type: string; id: string } | null = null,
  ): Result<void, ProductError> {
    if (!this.props.trackStock) {
      return err({ kind: 'StockNotTracked', sku: this.props.sku });
    }
    if (!quantity.isPositive) {
      return err({ kind: 'OutOfRange', field: 'quantity', min: 0 });
    }

    this.applyMovement('in', quantity, this.props.onHand.add(quantity), at, ref, null);
    return ok(undefined);
  }

  /**
   * Ajuste manual de inventario, tras un conteo fisico.
   *
   * Exige un motivo: un ajuste sin explicacion es indistinguible de un descuadre, y en
   * una auditoria posterior nadie sabra si fue merma, robo o error de captura.
   */
  adjustStock(newBalance: Quantity, reason: string, at: Date): Result<void, ProductError> {
    if (!this.props.trackStock) {
      return err({ kind: 'StockNotTracked', sku: this.props.sku });
    }
    if (reason.trim().length === 0) {
      return err({ kind: 'Required', field: 'reason' });
    }
    if (newBalance.isNegative && this.props.stockPolicy === 'deny_negative') {
      return err({ kind: 'OutOfRange', field: 'newBalance', min: 0 });
    }

    const delta = newBalance.subtract(this.props.onHand);
    if (delta.isZero) return ok(undefined);

    this.applyMovement('adjust', delta, newBalance, at, null, reason.trim());
    return ok(undefined);
  }

  /**
   * Devuelve al inventario lo que salio con un documento anulado.
   *
   * Se registra como movimiento COMPENSATORIO en lugar de borrar el original: el
   * historico tiene que poder explicar que salio y que volvio, no fingir que nunca paso.
   */
  compensateStock(
    quantity: Quantity,
    at: Date,
    ref: { type: string; id: string },
  ): Result<void, ProductError> {
    if (!this.props.trackStock) return ok(undefined);

    this.applyMovement(
      'void_compensation',
      quantity,
      this.props.onHand.add(quantity),
      at,
      ref,
      'Anulacion de documento',
    );
    return ok(undefined);
  }

  private applyMovement(
    kind: StockMovement['kind'],
    delta: Quantity,
    balanceAfter: Quantity,
    at: Date,
    ref: { type: string; id: string } | null,
    note: string | null,
  ): void {
    this.props = { ...this.props, onHand: balanceAfter };
    this.pendingMovements.push({
      kind,
      quantity: delta,
      balanceAfter,
      refType: ref?.type ?? null,
      refId: ref?.id ?? null,
      note,
      occurredAt: at,
    });
  }

  /** Movimientos acumulados. Los recoge el repositorio para escribirlos en la misma transaccion. */
  pullStockMovements(): readonly StockMovement[] {
    const movements = this.pendingMovements;
    this.pendingMovements = [];
    return movements;
  }

  changePrice(price: Money): Result<void, ProductError> {
    if (price.isNegative) return err({ kind: 'OutOfRange', field: 'price', min: 0 });
    this.props = { ...this.props, price };
    return ok(undefined);
  }

  rename(name: string): Result<void, ProductError> {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN) return err({ kind: 'TooShort', field: 'name', min: NAME_MIN });
    if (trimmed.length > NAME_MAX) return err({ kind: 'TooLong', field: 'name', max: NAME_MAX });
    this.props = { ...this.props, name: trimmed };
    return ok(undefined);
  }

  archive(at: Date): void {
    if (this.isArchived) return;
    this.props = { ...this.props, archivedAt: at };
    this.recordEvent({
      type: 'product.archived',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: { productId: this.id, sku: this.props.sku },
    });
  }

  snapshot(): ProductProps & { id: ProductId } {
    return { id: this.id, ...this.props };
  }
}
