import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type ProductId, type TenantId, type UserId } from '../shared/entity';
import { Money } from '../shared/value-objects/money';
import type { Quantity } from '../shared/value-objects/quantity';
import type { PosDeviceId, PosRegisterId, PosSaleId, PosShiftId } from './pos-ids';

export type PosSaleStatus = 'completed' | 'voided';
export type PosPaymentMethod = 'cash' | 'card' | 'transfer' | 'split';

export interface PosSaleLine {
  readonly id: string;
  readonly productId: ProductId | null;
  readonly temporaryName: string | null;
  readonly barcodeScanned: string | null;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

export type PosSaleError =
  | ValidationError
  | { kind: 'EmptySaleLines' }
  | { kind: 'SaleAlreadyVoided'; saleId: string }
  | { kind: 'CurrencyMismatch'; left: string; right: string };

export interface PosSaleProps {
  readonly id: PosSaleId;
  readonly tenantId: TenantId;
  readonly registerId: PosRegisterId;
  readonly deviceId: PosDeviceId;
  readonly shiftId: PosShiftId;
  readonly cashierUserId: UserId;
  readonly operationId: string;
  readonly ticketNumber: string;
  readonly status: PosSaleStatus;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly paymentMethod: PosPaymentMethod;
  readonly lines: readonly PosSaleLine[];
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly postedAt: Date;
}

export class PosSale extends AggregateRoot<PosSaleId> {
  private _status: PosSaleStatus;

  private constructor(
    id: PosSaleId,
    readonly tenantId: TenantId,
    readonly registerId: PosRegisterId,
    readonly deviceId: PosDeviceId,
    readonly shiftId: PosShiftId,
    readonly cashierUserId: UserId,
    readonly operationId: string,
    readonly ticketNumber: string,
    status: PosSaleStatus,
    readonly subtotal: Money,
    readonly tax: Money,
    readonly total: Money,
    readonly paymentMethod: PosPaymentMethod,
    readonly lines: readonly PosSaleLine[],
    readonly occurredAt: Date,
    readonly receivedAt: Date,
    readonly postedAt: Date,
  ) {
    super(id);
    this._status = status;
  }

  static create(params: {
    id: PosSaleId;
    tenantId: TenantId;
    registerId: PosRegisterId;
    deviceId: PosDeviceId;
    shiftId: PosShiftId;
    cashierUserId: UserId;
    operationId: string;
    ticketNumber: string;
    paymentMethod: PosPaymentMethod;
    lines: readonly {
      id: string;
      productId: ProductId | null;
      temporaryName?: string | null;
      barcodeScanned?: string | null;
      quantity: Quantity;
      unitPrice: Money;
    }[];
    taxRateBp: number;
    occurredAt: Date;
    receivedAt: Date;
    postedAt: Date;
  }): Result<PosSale, PosSaleError> {
    if (params.lines.length === 0) {
      return err({ kind: 'EmptySaleLines' });
    }

    const trimmedTicket = params.ticketNumber.trim();
    if (!/^[A-Z0-9_-]+-\d{4,}$/.test(trimmedTicket)) {
      return err({
        kind: 'FieldRequired',
        field: 'ticketNumber',
      });
    }

    const currency = params.lines[0].unitPrice.currency;
    let subtotalMinor = 0n;
    const computedLines: PosSaleLine[] = [];

    for (const line of params.lines) {
      if (line.unitPrice.currency !== currency) {
        return err({
          kind: 'CurrencyMismatch',
          left: line.unitPrice.currency,
          right: currency,
        });
      }

      const lineTotalMinor = (line.quantity.scaledValue * line.unitPrice.minorUnits) / 1000n;
      const lineTotal = Money.fromMinor(lineTotalMinor, currency);
      subtotalMinor += lineTotalMinor;

      computedLines.push({
        id: line.id,
        productId: line.productId,
        temporaryName: line.temporaryName?.trim() || null,
        barcodeScanned: line.barcodeScanned?.trim() || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal,
      });
    }

    const subtotal = Money.fromMinor(subtotalMinor, currency);
    const taxMinor = (subtotalMinor * BigInt(params.taxRateBp)) / 10_000n;
    const tax = Money.fromMinor(taxMinor, currency);
    const total = Money.fromMinor(subtotalMinor + taxMinor, currency);

    const sale = new PosSale(
      params.id,
      params.tenantId,
      params.registerId,
      params.deviceId,
      params.shiftId,
      params.cashierUserId,
      params.operationId,
      trimmedTicket,
      'completed',
      subtotal,
      tax,
      total,
      params.paymentMethod,
      computedLines,
      params.occurredAt,
      params.receivedAt,
      params.postedAt,
    );

    sale.recordEvent({
      type: 'pos.sale.completed',
      occurredAt: sale.occurredAt,
      tenantId: sale.tenantId,
      payload: {
        saleId: sale.id,
        ticketNumber: sale.ticketNumber,
        shiftId: sale.shiftId,
        registerId: sale.registerId,
        cashierUserId: sale.cashierUserId,
        operationId: sale.operationId,
        totalMinor: sale.total.minorUnits.toString(),
        currency: sale.total.currency,
        paymentMethod: sale.paymentMethod,
        linesCount: sale.lines.length,
      },
    });

    return ok(sale);
  }

  static rehydrate(props: PosSaleProps): PosSale {
    return new PosSale(
      props.id,
      props.tenantId,
      props.registerId,
      props.deviceId,
      props.shiftId,
      props.cashierUserId,
      props.operationId,
      props.ticketNumber,
      props.status,
      props.subtotal,
      props.tax,
      props.total,
      props.paymentMethod,
      props.lines,
      props.occurredAt,
      props.receivedAt,
      props.postedAt,
    );
  }

  get status(): PosSaleStatus {
    return this._status;
  }

  void(userId: UserId, reason: string, voidedAt: Date): Result<void, PosSaleError> {
    if (this._status === 'voided') {
      return err({ kind: 'SaleAlreadyVoided', saleId: this.id });
    }

    this._status = 'voided';

    this.recordEvent({
      type: 'pos.sale.voided',
      occurredAt: voidedAt,
      tenantId: this.tenantId,
      payload: {
        saleId: this.id,
        ticketNumber: this.ticketNumber,
        voidedByUserId: userId,
        reason: reason.trim(),
      },
    });

    return ok(undefined);
  }
}
