import {
  ok,
  err,
  can,
  type Result,
  type GoodsReceiptError,
  type Product,
  type ProductError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: anular una recepcion de mercancia y quitar del inventario lo que entro.
 *
 * Es el simetrico de anular una nota de entrega, y tambien en los permisos: quien trabaja
 * en almacen RECIBE mercancia pero no deshace una recepcion. Deshacerla resta del
 * inventario y reescribe lo que el historico dice que entro aquel dia, asi que exige el
 * mismo nivel de responsabilidad que anular una venta. Esa separacion vive en la matriz
 * de permisos, no en un condicional suelto.
 *
 * La diferencia con ventas no es de forma sino de direccion: alli se DEVUELVE al
 * inventario lo que salio; aqui se QUITA lo que entro. Y eso puede fallar — si la
 * mercancia ya se vendio, el saldo no da para deshacer la entrada, y no se puede fingir
 * que nunca llego algo que ya salio.
 */

export interface VoidGoodsReceiptInput {
  readonly goodsReceiptId: string;
  readonly reason: string;
}

export type VoidGoodsReceiptError =
  | { kind: 'Forbidden' }
  | { kind: 'GoodsReceiptNotFound'; goodsReceiptId: string }
  | GoodsReceiptError
  | ProductError;

export interface VoidGoodsReceiptDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeVoidGoodsReceipt(deps: VoidGoodsReceiptDeps) {
  return async function voidGoodsReceipt(
    input: VoidGoodsReceiptInput,
  ): Promise<Result<{ number: string }, VoidGoodsReceiptError>> {
    if (!can(deps.ctx.actor, 'purchase:void')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const receipt = await repos.goodsReceipts.findById(input.goodsReceiptId);
      if (!receipt) {
        return err({ kind: 'GoodsReceiptNotFound', goodsReceiptId: input.goodsReceiptId });
      }

      const voided = receipt.void(input.reason, deps.clock.now());
      if (!voided.ok) return voided;

      // Se cargan los productos que el documento toco para revertir sobre ellos la
      // entrada. Un producto que ya no exista simplemente no aparece en el mapa: el
      // agregado lo tolera y la anulacion sigue adelante, porque no poder anular por un
      // producto borrado seria peor que la alternativa.
      const ids = voided.value.map((entry) => entry.productId);
      const products = await repos.products.findManyByIds(ids);
      const byId = new Map<string, Product>(products.map((p) => [p.id, p]));

      for (const entry of voided.value) {
        const product = byId.get(entry.productId);
        if (!product) continue;

        const reverted = product.reverseStockEntry(entry.quantity, deps.clock.now(), {
          type: 'goods_receipt',
          id: receipt.id,
        });
        // Aqui SI puede fallar de verdad, a diferencia de la recepcion: si lo recibido ya
        // se vendio, el saldo no da. Se propaga en lugar de continuar — media anulacion
        // aplicada deja el inventario descuadrado, que es peor que no anular.
        if (!reverted.ok) return reverted;
      }

      await repos.goodsReceipts.save(receipt);
      await repos.products.saveMany([...byId.values()]);
      await repos.audit.record({
        action: 'goods_receipt.voided',
        entityType: 'goods_receipt',
        entityId: receipt.id,
        summary: {
          number: receipt.number,
          reason: input.reason.trim(),
          revertedLines: voided.value.length,
        },
      });

      // El contador mensual NO se decrementa: el documento existio, se registro y ocupo
      // un correlativo. Es la misma decision que en la anulacion de ventas, y por el
      // mismo motivo — devolver la cuota permitiria recibir y anular en bucle para
      // saltarse el limite del plan.
      return ok({ number: receipt.number });
    });
  };
}
