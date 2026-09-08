import {
  ok,
  err,
  can,
  asId,
  Money,
  Product,
  Quantity,
  type Result,
  type ProductId,
  type ProductError,
  type QuotaError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { periodOf } from '../period';

/**
 * Caso de uso: dar de alta un producto.
 *
 * Sigue el mismo orden que el resto: autorizacion, cuota, codigo, invariantes del
 * dominio y escritura atomica.
 *
 * EL SKU ES LA UNICA EXCEPCION a que el sistema genere los codigos. Si no se
 * escribe, lo genera —`PRD26000001`— y nadie tiene que inventarse nada. Si se
 * escribe, se respeta, y esa puerta se deja abierta a proposito: el codigo de un
 * producto suele existir ANTES que el sistema. Esta impreso en la etiqueta del
 * estante, o es el codigo de barras del fabricante. Cerrarla obligaria a mantener
 * dos codigos para la misma bolsa de harina, y el que gana esa pelea siempre es el
 * que ya esta pegado al producto.
 */

export interface CreateProductInput {
  /** Opcional. Vacio o ausente, lo genera el sistema. */
  readonly sku?: string | null;
  readonly name: string;
  readonly price: string;
  readonly unit?: string;
  readonly cost?: string | null;
  readonly initialStock?: string | null;
  readonly minStock?: string | null;
  readonly taxable?: boolean;
  readonly trackStock?: boolean;
}

export type CreateProductError =
  | { kind: 'Forbidden' }
  | { kind: 'DuplicateSku'; sku: string }
  | { kind: 'InvalidPrice'; raw: string }
  | { kind: 'InvalidCost'; raw: string }
  | { kind: 'InvalidStock'; raw: string }
  | QuotaError
  | ProductError;

export interface CreateProductDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeCreateProduct(deps: CreateProductDeps) {
  return async function createProduct(
    input: CreateProductInput,
  ): Promise<Result<{ id: string; sku: string }, CreateProductError>> {
    if (!can(deps.ctx.actor, 'product:write')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const used = await repos.usage.current('products');
      const quota = deps.ctx.plan.checkQuota('products', used);
      if (!quota.ok) return quota;

      // El SKU escrito se comprueba; el generado no puede chocar, porque sale de
      // un correlativo consumido con bloqueo dentro de esta misma transaccion.
      const typed = (input.sku ?? '').trim().toUpperCase();
      if (typed !== '') {
        const existing = await repos.products.findBySku(typed);
        if (existing) return err({ kind: 'DuplicateSku', sku: typed });
      }

      const sku =
        typed === '' ? await repos.sequences.next('product', periodOf(deps.clock.now())) : typed;

      const price = Money.of(input.price, deps.ctx.settings.baseCurrency);
      if (!price.ok) return err({ kind: 'InvalidPrice', raw: input.price });

      let cost: Money | null = null;
      if (input.cost != null && input.cost.trim() !== '') {
        const parsed = Money.of(input.cost, deps.ctx.settings.baseCurrency);
        if (!parsed.ok) return err({ kind: 'InvalidCost', raw: input.cost });
        cost = parsed.value;
      }

      let initialStock = Quantity.zero();
      if (input.initialStock != null && input.initialStock.trim() !== '') {
        const parsed = Quantity.of(input.initialStock);
        if (!parsed.ok) return err({ kind: 'InvalidStock', raw: input.initialStock });
        initialStock = parsed.value;
      }

      let minStock: Quantity | null = null;
      if (input.minStock != null && input.minStock.trim() !== '') {
        const parsed = Quantity.of(input.minStock);
        if (!parsed.ok) return err({ kind: 'InvalidStock', raw: input.minStock });
        minStock = parsed.value;
      }

      const created = Product.create({
        id: asId<ProductId>(deps.ids.next()),
        tenantId: deps.ctx.tenantId,
        sku,
        name: input.name,
        price: price.value,
        cost,
        initialStock,
        minStock,
        ...(input.unit ? { unit: input.unit } : {}),
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
        ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}),
        createdAt: deps.clock.now(),
      });
      if (!created.ok) return created;

      const product = created.value;

      await repos.products.save(product);
      await repos.usage.increment('products');
      await repos.audit.record({
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        summary: {
          sku: product.sku,
          name: product.name,
          price: product.price.toString(),
          initialStock: initialStock.toCompactString(),
        },
      });

      return ok({ id: product.id, sku: product.sku });
    });
  };
}
