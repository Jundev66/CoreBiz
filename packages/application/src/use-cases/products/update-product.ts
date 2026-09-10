import {
  ok,
  err,
  can,
  asId,
  Money,
  Quantity,
  type Result,
  type ProductId,
  type ProductError,
} from '@corebiz/domain';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { soloLoQueCambio } from '../../audit-diff';

/**
 * Caso de uso: corregir la ficha de un producto.
 *
 * ESTE CASO DE USO NO PUEDE MOVER EL INVENTARIO, y esa es toda su dificultad.
 *
 * El repositorio escribe `on_hand` desde el agregado en el mismo UPSERT con el que
 * guarda la ficha. Si algo aqui llamase a un metodo de stock, el saldo cambiaria y —
 * segun por donde— podria no quedar el asiento que lo explica. El inventario dejaria de
 * cuadrar sin que nadie hubiera declarado una entrada ni una salida, y eso no se
 * descubre hasta que alguien cuenta el estante.
 *
 * Por eso solo se invocan metodos de la seccion de edicion de `Product`, y hay un test
 * de dominio que afirma que ninguno de ellos deja movimientos pendientes.
 *
 * QUE NO SE PUEDE EDITAR, Y POR QUE
 *
 * El `sku` NO se toca, aunque al crear si se pueda escribir. El codigo de un producto
 * suele existir antes que el sistema —esta impreso en la etiqueta del estante o es el
 * codigo de barras del fabricante— y cambiarlo aqui dejaria el estante diciendo una cosa
 * y la pantalla otra. Permitirlo ademas exigiria saber si ese SKU ya viajo en un
 * documento emitido, y esa consulta no existe.
 *
 * `trackStock` y `stockPolicy` tampoco. Apagar el seguimiento de un producto que tiene
 * saldo deja ese saldo huerfano: ni desaparece ni se puede explicar. Eso es una
 * migracion de datos con su decision detras, no una casilla en un formulario.
 *
 * Y `onHand` menos que ninguno: el saldo solo se mueve declarando un movimiento, y para
 * corregirlo ya existe `adjust-stock`, que EXIGE un motivo. Un inventario en el que se
 * puede teclear el saldo directamente no es un inventario, es una nota adhesiva.
 */

export interface UpdateProductInput {
  readonly productId: string;
  readonly name: string;
  readonly price: string;
  readonly cost?: string | null;
  readonly description?: string | null;
  readonly unit?: string | null;
  readonly minStock?: string | null;
  readonly taxable?: boolean;
}

export type UpdateProductError =
  | { kind: 'Forbidden' }
  | { kind: 'ProductNotFound'; productId: string }
  | { kind: 'InvalidPrice'; raw: string }
  | { kind: 'InvalidCost'; raw: string }
  | { kind: 'InvalidStock'; raw: string }
  | ProductError;

export interface UpdateProductDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
}

export function makeUpdateProduct(deps: UpdateProductDeps) {
  return async function updateProduct(
    input: UpdateProductInput,
  ): Promise<Result<{ id: string; sku: string }, UpdateProductError>> {
    if (!can(deps.ctx.actor, 'product:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const product = await repos.products.findById(asId<ProductId>(input.productId));
      if (!product) return err({ kind: 'ProductNotFound', productId: input.productId });

      const antes = {
        name: product.name,
        price: product.price.toString(),
        cost: product.cost?.toString() ?? null,
        unit: product.unit,
        minStock: product.minStock?.toCompactString() ?? null,
      };
      const saldoAntes = product.onHand.toCompactString();

      const renamed = product.rename(input.name);
      if (!renamed.ok) return renamed;

      const price = Money.of(input.price, deps.ctx.settings.baseCurrency);
      if (!price.ok) return err({ kind: 'InvalidPrice', raw: input.price });
      const priced = product.changePrice(price.value);
      if (!priced.ok) return priced;

      if (input.cost != null && input.cost.trim() !== '') {
        const cost = Money.of(input.cost, deps.ctx.settings.baseCurrency);
        if (!cost.ok) return err({ kind: 'InvalidCost', raw: input.cost });
        const costed = product.changeCost(cost.value);
        if (!costed.ok) return costed;
      } else {
        const cleared = product.changeCost(null);
        if (!cleared.ok) return cleared;
      }

      if (input.minStock != null && input.minStock.trim() !== '') {
        const min = Quantity.of(input.minStock);
        if (!min.ok) return err({ kind: 'InvalidStock', raw: input.minStock });
        const seteado = product.setMinimumStock(min.value);
        if (!seteado.ok) return seteado;
      } else {
        const cleared = product.setMinimumStock(null);
        if (!cleared.ok) return cleared;
      }

      const catalogued = product.updateCatalogDetails({
        description: input.description ?? null,
        ...(input.unit != null ? { unit: input.unit } : {}),
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
      });
      if (!catalogued.ok) return catalogued;

      // El cinturon, ademas del tirante. El test de dominio comprueba que los metodos
      // de edicion no mueven stock; esto comprueba que ESTE caso de uso no llamo a
      // ningun otro. Es barato y cubre el descuido de manana, no el de hoy.
      if (product.onHand.toCompactString() !== saldoAntes) {
        throw new Error(
          'update-product ha movido el inventario. Corregir la ficha no puede cambiar el saldo: para eso esta adjust-stock, que exige un motivo.',
        );
      }

      await repos.products.save(product);

      const despues = {
        name: product.name,
        price: product.price.toString(),
        cost: product.cost?.toString() ?? null,
        unit: product.unit,
        minStock: product.minStock?.toCompactString() ?? null,
      };

      await repos.audit.record({
        action: 'product.updated',
        entityType: 'product',
        entityId: product.id,
        summary: { sku: product.sku, name: product.name },
        diff: soloLoQueCambio(antes, despues),
      });

      return ok({ id: product.id, sku: product.sku });
    });
  };
}
