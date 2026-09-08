import { ok, err, can, asId, type Result, type ProductId } from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: sacar un producto del catalogo o devolverlo.
 *
 * Igual que con los clientes, no hay "eliminar": un producto que aparece en notas de
 * entrega emitidas no se puede borrar sin dejar esas lineas apuntando al vacio.
 *
 * El inventario que tuviera NO se toca al archivar. Es lo correcto y conviene decirlo:
 * si quedaban tres bolsas en el estante, siguen ahi. Poner el saldo a cero seria
 * inventar una salida de mercancia que nunca ocurrio, y el libro de movimientos dejaria
 * de explicar el saldo — que es lo unico que hace fiable un inventario.
 */

export interface SetProductStatusInput {
  readonly productId: string;
  readonly archived: boolean;
}

export type SetProductStatusError =
  { kind: 'Forbidden' } | { kind: 'ProductNotFound'; productId: string };

export interface SetProductStatusDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeSetProductStatus(deps: SetProductStatusDeps) {
  return async function setProductStatus(
    input: SetProductStatusInput,
  ): Promise<Result<{ archived: boolean }, SetProductStatusError>> {
    if (!can(deps.ctx.actor, 'product:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const product = await repos.products.findById(asId<ProductId>(input.productId));
      if (!product) return err({ kind: 'ProductNotFound', productId: input.productId });

      if (input.archived) product.archive(deps.clock.now());
      else product.restore();

      await repos.products.save(product);
      await repos.audit.record({
        action: input.archived ? 'product.archived' : 'product.restored',
        entityType: 'product',
        entityId: product.id,
        summary: { sku: product.sku, name: product.name },
      });

      return ok({ archived: input.archived });
    });
  };
}
