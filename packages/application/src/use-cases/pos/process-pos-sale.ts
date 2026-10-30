import {
  ok,
  err,
  can,
  asId,
  PosSale,
  Quantity,
  Money,
  InventoryConflict,
  type Result,
  type PosSaleId,
  type PosRegisterId,
  type PosDeviceId,
  type PosShiftId,
  type ProductId,
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
    if (!can(deps.ctx.actor, 'deliveryNotes:create')) {
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

      const shiftId: PosShiftId = asId(input.shiftId);
      const shift = await repos.cashShifts.findById(shiftId);
      if (!shift) {
        return err({ kind: 'ShiftNotFound', shiftId: input.shiftId });
      }
      if (shift.status !== 'open') {
        return err({ kind: 'ShiftNotOpen', shiftId: input.shiftId });
      }

      const saleId: PosSaleId = input.saleId ? asId(input.saleId) : asId(deps.ids.next());
      const registerId: PosRegisterId = asId(input.registerId);
      const deviceId: PosDeviceId = asId(input.deviceId);
      const occurredAt = new Date(input.occurredAt);
      const postedAt = deps.clock.now();

      const computedLines = [];
      const productsToUpdate = [];
      let detectedConflictId: string | undefined;

      for (const line of input.lines) {
        const qty = Quantity.of(line.quantity);
        if (!qty.ok) {
          return err({ kind: 'FieldRequired', field: 'quantity' });
        }

        const unitPrice = Money.fromMinor(
          BigInt(line.unitPriceMinor),
          deps.ctx.settings.baseCurrency,
        );

        const prodId: ProductId | null = line.productId ? asId(line.productId) : null;

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
        cashierUserId: deps.ctx.actor.userId,
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
        conflictId: detectedConflictId,
      });
    });
  };
}
