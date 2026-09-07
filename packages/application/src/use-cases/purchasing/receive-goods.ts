import {
  ok,
  err,
  can,
  asId,
  GoodsReceipt,
  Money,
  Quantity,
  type Result,
  type FeatureError,
  type GoodsReceiptError,
  type Product,
  type ProductError,
  type ProductId,
  type SupplierId,
  type QuotaError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: registrar la entrada de mercancia.
 *
 * Es el reverso exacto de emitir una nota de entrega, y esa simetria es el punto
 * del modulo entero: la recepcion SUMA generando movimientos en el mismo libro
 * mayor del que la emision RESTA. No hay dos inventarios, ni un campo que se
 * "ajusta" al comprar. Hay un saldo, y una historia que lo explica.
 *
 * Quien mueve el stock es `Product.addStock()`, no este archivo ni el agregado
 * `GoodsReceipt`. El documento decide QUE entra; el producto decide si puede y
 * escribe el movimiento. Si el documento tocara saldos, habria dos sitios capaces
 * de descuadrar el inventario.
 */

export interface ReceiveGoodsInput {
  readonly supplierId: string;
  readonly lines: readonly {
    readonly productId: string;
    readonly quantity: string;
    readonly unitCost: string;
  }[];
  readonly supplierReference?: string | null;
  readonly notes?: string | null;
}

export type ReceiveGoodsError =
  | { kind: 'Forbidden' }
  | { kind: 'SupplierNotFound'; supplierId: string }
  | { kind: 'ProductNotFound'; productId: string }
  | { kind: 'InvalidQuantity'; productId: string; raw: string }
  | { kind: 'InvalidCost'; productId: string; raw: string }
  | FeatureError
  | QuotaError
  | GoodsReceiptError
  // `addStock` devuelve ProductError. En la practica no puede fallar aqui —el
  // agregado ya rechazo los productos sin inventario y las cantidades no
  // positivas— pero el tipo no lo sabe, y forzarlo con un `as` seria mentirle al
  // compilador sobre la unica rama que nadie ha probado.
  | ProductError;

export interface ReceiveGoodsOutput {
  readonly id: string;
  readonly number: string;
  readonly total: string;
}

export interface ReceiveGoodsDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeReceiveGoods(deps: ReceiveGoodsDeps) {
  return async function receiveGoods(
    input: ReceiveGoodsInput,
  ): Promise<Result<ReceiveGoodsOutput, ReceiveGoodsError>> {
    const gate = deps.ctx.plan.checkFeature('purchasing');
    if (!gate.ok) return gate;

    if (!can(deps.ctx.actor, 'purchase:receive')) {
      return err({ kind: 'Forbidden' });
    }

    const currency = deps.ctx.settings.baseCurrency;

    return deps.uow.run(async (repos) => {
      // La recepcion cuenta como documento del mes, igual que una nota de
      // entrega: las dos consumen el mismo recurso del plan porque las dos son
      // documentos que el sistema guarda para siempre.
      const usage = await repos.usage.current('documents_month');
      const quota = deps.ctx.plan.checkQuota('documents_month', usage);
      if (!quota.ok) return quota;

      const supplier = await repos.suppliers.findById(asId<SupplierId>(input.supplierId));
      if (!supplier) return err({ kind: 'SupplierNotFound', supplierId: input.supplierId });

      // Todos los productos de una vez: pedirlos uno a uno dentro del bucle
      // serian N+1 consultas con una transaccion abierta.
      const productIds = input.lines.map((l) => asId<ProductId>(l.productId));
      const products = await repos.products.findManyByIds(productIds);
      const byId = new Map<string, Product>(products.map((p) => [p.id, p]));

      const lines: Parameters<typeof GoodsReceipt.receive>[0]['lines'][number][] = [];

      for (const line of input.lines) {
        const product = byId.get(line.productId);
        if (!product) return err({ kind: 'ProductNotFound', productId: line.productId });

        const quantity = Quantity.positive(line.quantity);
        if (!quantity.ok) {
          return err({ kind: 'InvalidQuantity', productId: line.productId, raw: line.quantity });
        }

        const unitCost = Money.of(line.unitCost, currency);
        if (!unitCost.ok) {
          return err({ kind: 'InvalidCost', productId: line.productId, raw: line.unitCost });
        }

        lines.push({
          product: {
            id: product.id,
            name: product.name,
            unit: product.unit,
            trackStock: product.trackStock,
          },
          quantity: quantity.value,
          unitCost: unitCost.value,
        });
      }

      const number = await repos.sequences.next('goods_receipt');

      const created = GoodsReceipt.receive({
        id: deps.ids.next(),
        tenantId: deps.ctx.tenantId,
        number,
        supplierId: supplier.id,
        currency,
        lines,
        supplierReference: input.supplierReference ?? null,
        notes: input.notes ?? null,
        receivedAt: deps.clock.now(),
        receivedBy: deps.ctx.actor.userId,
      });
      if (!created.ok) return created;

      const receipt = created.value;

      // AQUI entra la mercancia al inventario, y solo aqui. Cada `addStock` deja
      // un movimiento pendiente en el agregado Product, que el repositorio
      // recoge con `pullStockMovements()` al guardarlo.
      for (const entry of receipt.stockEntries) {
        const product = byId.get(entry.productId);
        if (!product) continue;

        const added = product.addStock(entry.quantity, deps.clock.now(), {
          type: 'goods_receipt',
          id: receipt.id,
        });
        // No deberia fallar: el agregado ya rechazo los productos sin inventario
        // y las cantidades no positivas. Si falla, se propaga en vez de
        // continuar: media recepcion aplicada es peor que ninguna.
        if (!added.ok) return added;
      }

      await repos.goodsReceipts.save(receipt);
      await repos.products.saveMany([...byId.values()]);
      await repos.usage.increment('documents_month');
      await repos.audit.record({
        action: 'goods_receipt.received',
        entityType: 'goods_receipt',
        entityId: receipt.id,
        summary: {
          number: receipt.number,
          supplier: supplier.name,
          total: receipt.total.toString(),
          lines: receipt.lines.length,
        },
      });

      return ok({ id: receipt.id, number: receipt.number, total: receipt.total.toString() });
    });
  };
}
