import {
  ok,
  err,
  can,
  asId,
  PosSale,
  CashShift,
  Customer,
  Quantity,
  Money,
  InventoryConflict,
  type Result,
  type PosSaleId,
  type PosRegisterId,
  type PosDeviceId,
  type PosShiftId,
  type CustomerId,
  type ProductId,
  type UserId,
  type InventoryConflictId,
  type PosPaymentMethod,
  type PosSaleError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface ProcessPosSaleInput {
  readonly saleId?: string;
  readonly operationId: string;
  readonly sequence: number;
  readonly payloadHash: string;
  readonly registerId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly ticketNumber: string;
  readonly invoiceControlNumber?: string | null;
  readonly customerName?: string | null;
  readonly customerDoc?: string | null;
  readonly exchangeRateBcv?: string | null;
  readonly paymentMethod: PosPaymentMethod;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string | null;
    readonly temporaryName?: string | null;
    readonly barcodeScanned?: string | null;
    readonly quantity: string;
    readonly unitPriceMinor: string;
  }[];
  readonly occurredAt: string;
}

export type ProcessPosSaleError =
  | { kind: 'Forbidden' }
  | { kind: 'ShiftNotFound'; shiftId: string }
  | { kind: 'ShiftNotOpen'; shiftId: string }
  | { kind: 'InvalidPayloadHash'; operationId: string }
  | PosSaleError;

export interface ProcessPosSaleOutput {
  readonly status: 'processed' | 'duplicate';
  readonly saleId: string;
  readonly ticketNumber: string;
  readonly conflictId?: string;
}

export interface ProcessPosSaleDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeProcessPosSale(deps: ProcessPosSaleDeps) {
  return async function processPosSale(
    input: ProcessPosSaleInput,
  ): Promise<Result<ProcessPosSaleOutput, ProcessPosSaleError>> {
    if (!can(deps.ctx.actor, 'delivery_note:issue')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const existingOp = await repos.posSyncOperations.findByOperationId(input.operationId);
      if (existingOp) {
        if (existingOp.payloadHash !== input.payloadHash) {
          return err({ kind: 'InvalidPayloadHash', operationId: input.operationId });
        }
        return ok({
          status: 'duplicate',
          saleId: existingOp.id,
          ticketNumber: input.ticketNumber,
        });
      }

      const shiftId: PosShiftId = asId<PosShiftId>(input.shiftId);
      let shift = await repos.cashShifts.findById(shiftId);
      if (!shift) {
        const registerId: PosRegisterId = asId<PosRegisterId>(input.registerId);
        const deviceId: PosDeviceId = asId<PosDeviceId>(input.deviceId);
        const autoShift = CashShift.open({
          id: shiftId,
          tenantId: deps.ctx.tenantId,
          registerId,
          deviceId,
          openedByUserId: asId<UserId>(deps.ctx.actor.userId),
          initialFloat: Money.zero(deps.ctx.settings.baseCurrency),
          now: new Date(input.occurredAt),
        });
        if (autoShift.ok) {
          await repos.cashShifts.save(autoShift.value);
          shift = autoShift.value;
        } else {
          return err({ kind: 'ShiftNotFound', shiftId: input.shiftId });
        }
      }
      if (shift.status !== 'open') {
        return err({ kind: 'ShiftNotOpen', shiftId: input.shiftId });
      }

      if (
        input.customerDoc &&
        input.customerDoc.trim() &&
        input.customerDoc.trim() !== 'V-00000000'
      ) {
        const cleanDoc = input.customerDoc.trim();
        const existing = await repos.customers.list({ search: cleanDoc, limit: 1 });
        if (existing.items.length === 0) {
          const custCode = `CLI-${cleanDoc.replace(/[^A-Za-z0-9]/g, '').slice(-8) || Date.now().toString().slice(-6)}`;
          const custResult = Customer.create({
            id: asId<CustomerId>(deps.ids.next()),
            tenantId: deps.ctx.tenantId,
            code: custCode,
            name: input.customerName?.trim() || 'Cliente POS',
            taxId: cleanDoc,
            createdAt: deps.clock.now(),
          });
          if (custResult.ok) {
            await repos.customers.save(custResult.value);
          }
        }
      }

      const saleId: PosSaleId = input.saleId
        ? asId<PosSaleId>(input.saleId)
        : asId<PosSaleId>(deps.ids.next());
      const registerId: PosRegisterId = asId<PosRegisterId>(input.registerId);
      const deviceId: PosDeviceId = asId<PosDeviceId>(input.deviceId);
      const occurredAt = new Date(input.occurredAt);
      const postedAt = deps.clock.now();

      const computedLines = [];
      const productsToUpdate = [];
      let detectedConflictId: string | undefined;

      for (const line of input.lines) {
        const qty = Quantity.of(line.quantity);
        if (!qty.ok) {
          return err({
            kind: 'InvalidFormat',
            field: 'quantity',
            expected: 'valid decimal quantity',
          });
        }

        const unitPrice = Money.fromMinor(
          BigInt(line.unitPriceMinor),
          deps.ctx.settings.baseCurrency,
        );

        const prodId: ProductId | null = line.productId ? asId<ProductId>(line.productId) : null;

        if (!prodId) {
          const conflictId = asId<InventoryConflictId>(deps.ids.next());
          const conflict = InventoryConflict.createUncatalogedProduct({
            id: conflictId,
            tenantId: deps.ctx.tenantId,
            detectedAt: postedAt,
            saleId,
          });
          if (conflict.ok) {
            await repos.inventoryConflicts.save(conflict.value);
            detectedConflictId = conflict.value.id;
          }
        } else {
          const product = await repos.products.findById(prodId);
          if (product && product.trackStock) {
            const stockBefore = product.onHand.scaledValue;
            const requested = qty.value.scaledValue;
            const stockAfter = stockBefore - requested;

            product.removeStock(qty.value, postedAt, {
              type: 'pos_sale',
              id: saleId,
            });

            productsToUpdate.push(product);

            if (stockAfter < 0n) {
              const conflictId = asId<InventoryConflictId>(deps.ids.next());
              const conflict = InventoryConflict.createNegativeStock({
                id: conflictId,
                tenantId: deps.ctx.tenantId,
                productId: prodId,
                stockBefore,
                quantityAttempted: requested,
                stockAfter,
                shortageQuantity: -stockAfter,
                detectedAt: postedAt,
                saleId,
              });
              if (conflict.ok) {
                await repos.inventoryConflicts.save(conflict.value);
                detectedConflictId = conflict.value.id;
              }
            }
          }
        }

        computedLines.push({
          id: line.id,
          productId: prodId,
          temporaryName: line.temporaryName ?? null,
          barcodeScanned: line.barcodeScanned ?? null,
          quantity: qty.value,
          unitPrice,
        });
      }

      const saleResult = PosSale.create({
        id: saleId,
        tenantId: deps.ctx.tenantId,
        registerId,
        deviceId,
        shiftId,
        cashierUserId: asId<UserId>(deps.ctx.actor.userId),
        operationId: input.operationId,
        ticketNumber: input.ticketNumber,
        paymentMethod: input.paymentMethod,
        lines: computedLines,
        taxRateBp: deps.ctx.settings.taxRateBp,
        occurredAt,
        receivedAt: postedAt,
        postedAt,
      });

      if (!saleResult.ok) {
        return saleResult;
      }

      const sale = saleResult.value;

      if (input.paymentMethod === 'cash') {
        shift.recordCashSale(sale.total);
        await repos.cashShifts.save(shift);
      }

      await repos.posSales.save(sale);
      if (productsToUpdate.length > 0) {
        await repos.products.saveMany(productsToUpdate);
      }

      await repos.posSyncOperations.save({
        id: deps.ids.next(),
        operationId: input.operationId,
        deviceId: input.deviceId,
        operationType: 'sale.issue',
        sequence: input.sequence,
        payloadHash: input.payloadHash,
        status: 'processed',
        receivedAt: postedAt,
        processedAt: postedAt,
        errorMessage: null,
      });

      await repos.audit.record({
        action: 'pos.sale.issued',
        entityType: 'pos_sale',
        entityId: sale.id,
        summary: {
          ticketNumber: sale.ticketNumber,
          totalMinor: sale.total.minorUnits.toString(),
          paymentMethod: sale.paymentMethod,
          shiftId: sale.shiftId,
          conflictId: detectedConflictId,
        },
      });

      return ok({
        status: 'processed',
        saleId: sale.id,
        ticketNumber: sale.ticketNumber,
        ...(detectedConflictId ? { conflictId: detectedConflictId } : {}),
      });
    });
  };
}
