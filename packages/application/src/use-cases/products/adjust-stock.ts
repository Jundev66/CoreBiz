import {
  ok,
  err,
  can,
  asId,
  Quantity,
  type Money,
  type Result,
  type ProductId,
  type ProductError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

export interface AdjustStockInput {
  readonly productId: string;
  readonly newBalance: string;
  readonly reason: string;
}

export type AdjustStockError =
  | { kind: 'Forbidden' }
  | { kind: 'ProductNotFound'; productId: string }
  | { kind: 'InvalidQuantity'; raw: string }
  | ProductError;

export interface StockAdjustedEvent {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly previousScaled: bigint;
  readonly newScaled: bigint;
  readonly deltaScaled: bigint;
  readonly unitCost: Money | null;
  readonly unitPrice: Money;
  readonly inventoryAccountId: string | null;
  readonly reason: string;
  readonly adjustedAt: Date;
}

export interface AdjustStockDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly onStockAdjusted?: (event: StockAdjustedEvent) => Promise<void>;
}

export function makeAdjustStock(deps: AdjustStockDeps) {
  return async function adjustStock(
    input: AdjustStockInput,
  ): Promise<Result<{ previous: string; current: string }, AdjustStockError>> {
    if (!can(deps.ctx.actor, 'stock:adjust')) {
      return err({ kind: 'Forbidden' });
    }

    const result = await deps.uow.run<
      Result<{ previous: string; current: string; event: StockAdjustedEvent }, AdjustStockError>
    >(async (repos) => {
      const product = await repos.products.findById(asId<ProductId>(input.productId));
      if (!product) return err({ kind: 'ProductNotFound', productId: input.productId });

      const newBalance = Quantity.of(input.newBalance);
      if (!newBalance.ok) return err({ kind: 'InvalidQuantity', raw: input.newBalance });

      const previous = product.onHand.toCompactString();
      const previousScaled = product.onHand.scaledValue;

      const adjusted = product.adjustStock(newBalance.value, input.reason, deps.clock.now());
      if (!adjusted.ok) return adjusted;

      await repos.products.save(product);
      await repos.audit.record({
        action: 'stock.adjusted',
        entityType: 'product',
        entityId: product.id,
        summary: {
          sku: product.sku,
          previous,
          current: product.onHand.toCompactString(),
          reason: input.reason.trim(),
        },
      });

      return ok({
        previous,
        current: product.onHand.toCompactString(),
        event: {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          previousScaled,
          newScaled: product.onHand.scaledValue,
          deltaScaled: product.onHand.scaledValue - previousScaled,
          unitCost: product.cost,
          unitPrice: product.price,
          inventoryAccountId: product.inventoryAccountId,
          reason: input.reason.trim(),
          adjustedAt: deps.clock.now(),
        } satisfies StockAdjustedEvent,
      });
    });

    if (!result.ok) return result;
    if (deps.onStockAdjusted && result.value.event.deltaScaled !== 0n) {
      await deps.onStockAdjusted(result.value.event);
    }

    return ok({ previous: result.value.previous, current: result.value.current });
  };
}
