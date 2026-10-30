import {
  ok,
  err,
  can,
  asId,
  Quantity,
  type Result,
  type InventoryConflictId,
  type ConflictResolutionType,
  type InventoryConflictError,
  type UserId,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface ResolveInventoryConflictInput {
  readonly conflictId: string;
  readonly resolutionType: ConflictResolutionType;
  readonly notes: string;
  readonly linkedProductId?: string;
}

export type ResolveInventoryConflictError =
  | { kind: 'Forbidden' }
  | { kind: 'ConflictNotFound'; conflictId: string }
  | { kind: 'ProductNotFound'; productId: string }
  | InventoryConflictError;

export interface ResolveInventoryConflictOutput {
  readonly conflictId: string;
  readonly status: string;
  readonly resolutionType: string;
  readonly resolvedAt: string;
}

export interface ResolveInventoryConflictDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeResolveInventoryConflict(deps: ResolveInventoryConflictDeps) {
  return async function resolveInventoryConflict(
    input: ResolveInventoryConflictInput,
  ): Promise<Result<ResolveInventoryConflictOutput, ResolveInventoryConflictError>> {
    if (!can(deps.ctx.actor, 'stock:adjust')) {
      return err({ kind: 'Forbidden' });
    }

    const conflictId: InventoryConflictId = asId<InventoryConflictId>(input.conflictId);
    const now = deps.clock.now();

    return deps.uow.run(async (repos) => {
      const conflict = await repos.inventoryConflicts.findById(conflictId);
      if (!conflict) {
        return err({ kind: 'ConflictNotFound', conflictId: input.conflictId });
      }

      let movementId: string | null = null;

      if (input.resolutionType === 'adjustment_in' && conflict.productId) {
        const product = await repos.products.findById(conflict.productId);
        if (!product) {
          return err({ kind: 'ProductNotFound', productId: conflict.productId });
        }

        const adjustmentQty = Quantity.fromScaled(conflict.shortageQuantity);
        const newBalance = product.onHand.add(adjustmentQty);
        movementId = deps.ids.next();

        product.adjustStock(
          newBalance,
          `Ajuste por resolucion de conflicto POS: ${input.notes}`,
          now,
        );

        await repos.products.save(product);
      }

      const resolveResult = conflict.resolve({
        resolutionType: input.resolutionType,
        notes: input.notes,
        resolvedBy: asId<UserId>(deps.ctx.actor.userId),
        resolvedAt: now,
        resolutionMovementId: movementId,
      });

      if (!resolveResult.ok) {
        return resolveResult;
      }

      await repos.inventoryConflicts.save(conflict);

      await repos.audit.record({
        action: 'pos.conflict.resolved',
        entityType: 'pos_inventory_conflict',
        entityId: conflict.id,
        summary: {
          resolutionType: input.resolutionType,
          notes: input.notes,
          shortageAdjusted: conflict.shortageQuantity.toString(),
          movementId,
        },
      });

      return ok({
        conflictId: conflict.id,
        status: conflict.status,
        resolutionType: conflict.resolutionType!,
        resolvedAt: conflict.resolvedAt!.toISOString(),
      });
    });
  };
}
