import {
  ok,
  err,
  can,
  asId,
  Quantity,
  type Result,
  type ProductId,
  type ProductError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: ajustar el inventario tras un conteo fisico.
 *
 * El motivo es obligatorio y llega hasta la auditoria. Un ajuste sin explicacion es
 * indistinguible de un descuadre, y meses despues nadie sabra si fue merma, robo o un
 * error de captura. Es el tipo de dato que solo se echa en falta cuando ya es tarde.
 */

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

export interface AdjustStockDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeAdjustStock(deps: AdjustStockDeps) {
  return async function adjustStock(
    input: AdjustStockInput,
  ): Promise<Result<{ previous: string; current: string }, AdjustStockError>> {
    if (!can(deps.ctx.actor, 'stock:adjust')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const product = await repos.products.findById(asId<ProductId>(input.productId));
      if (!product) return err({ kind: 'ProductNotFound', productId: input.productId });

      const newBalance = Quantity.of(input.newBalance);
      if (!newBalance.ok) return err({ kind: 'InvalidQuantity', raw: input.newBalance });

      // Se guarda el saldo anterior ANTES de ajustar: es la mitad de la informacion
      // que hace util la entrada de auditoria.
      const previous = product.onHand.toCompactString();

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

      return ok({ previous, current: product.onHand.toCompactString() });
    });
  };
}
