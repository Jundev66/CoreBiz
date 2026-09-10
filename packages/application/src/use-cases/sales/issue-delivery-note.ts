import {
  ok,
  err,
  can,
  asId,
  DeliveryNote,
  ExchangeRate,
  Money,
  Quantity,
  type Result,
  type DeliveryNoteId,
  type DeliveryNoteError,
  type ProductId,
  type CustomerId,
  type Product,
  type QuotaError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: emitir una nota de entrega.
 *
 * Es la operacion mas delicada del sistema. Toca, en un solo acto de negocio:
 * la secuencia de numeracion, el documento, sus lineas, los movimientos de stock, el
 * saldo de cada producto, el contador de uso y el registro de auditoria.
 *
 * O ocurre todo, o no ocurre nada. Un fallo a mitad deja el inventario descuadrado, y
 * un inventario descuadrado es un ERP en el que ya nadie confia. Por eso el proyecto
 * necesita transacciones reales y no puede apoyarse en PostgREST (ver ADR 004).
 */

export interface IssueDeliveryNoteInput {
  readonly customerId: string;
  readonly lines: readonly {
    readonly productId: string;
    readonly quantity: string;
    readonly unitPrice?: string;
    readonly discountBp?: number;
  }[];
  readonly notes?: string | null;
}

export type IssueDeliveryNoteError =
  | { kind: 'Forbidden' }
  | { kind: 'CustomerNotFound'; customerId: string }
  | { kind: 'ProductNotFound'; productId: string }
  | { kind: 'InvalidQuantity'; productId: string; raw: string }
  | { kind: 'InvalidUnitPrice'; productId: string; raw: string }
  | { kind: 'NoExchangeRate' }
  | { kind: 'CreditLimitExceeded'; customerId: string }
  | QuotaError
  | DeliveryNoteError;

export interface IssueDeliveryNoteOutput {
  readonly id: string;
  readonly number: string;
  readonly total: string;
  readonly totalInSecondaryCurrency: string;
}

export interface IssueDeliveryNoteDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeIssueDeliveryNote(deps: IssueDeliveryNoteDeps) {
  return async function issueDeliveryNote(
    input: IssueDeliveryNoteInput,
  ): Promise<Result<IssueDeliveryNoteOutput, IssueDeliveryNoteError>> {
    if (!can(deps.ctx.actor, 'delivery_note:issue')) {
      return err({ kind: 'Forbidden' });
    }

    // La tasa se resuelve ANTES de abrir la transaccion: sin ella no hay documento
    // posible, y es mejor fallar temprano que a mitad de una escritura.
    const { exchangeRateScaled, exchangeRateAt, baseCurrency } = deps.ctx.settings;
    if (exchangeRateScaled === null || exchangeRateAt === null) {
      return err({ kind: 'NoExchangeRate' });
    }
    const exchangeRate = ExchangeRate.fromScaled(
      exchangeRateScaled,
      baseCurrency,
      baseCurrency === 'USD' ? 'VES' : 'USD',
      exchangeRateAt,
    );

    return deps.uow.run(async (repos) => {
      const usage = await repos.usage.current('documents_month');
      const quota = deps.ctx.plan.checkQuota('documents_month', usage);
      if (!quota.ok) return quota;

      const customer = await repos.customers.findById(asId<CustomerId>(input.customerId));
      if (!customer) return err({ kind: 'CustomerNotFound', customerId: input.customerId });

      // Se cargan todos los productos de una vez: pedirlos uno a uno dentro del bucle
      // seria N+1 consultas dentro de una transaccion abierta, que es la peor version.
      const productIds = input.lines.map((l) => asId<ProductId>(l.productId));
      const products = await repos.products.findManyByIds(productIds);
      const byId = new Map<string, Product>(products.map((p) => [p.id, p]));

      const lines: Parameters<typeof DeliveryNote.issue>[0]['lines'][number][] = [];
      for (const line of input.lines) {
        const product = byId.get(line.productId);
        if (!product) return err({ kind: 'ProductNotFound', productId: line.productId });

        const quantity = Quantity.positive(line.quantity);
        if (!quantity.ok) {
          return err({ kind: 'InvalidQuantity', productId: line.productId, raw: line.quantity });
        }

        let unitPrice: Money | undefined;
        if (line.unitPrice !== undefined) {
          const parsed = Money.of(line.unitPrice, baseCurrency);
          if (!parsed.ok) {
            return err({
              kind: 'InvalidUnitPrice',
              productId: line.productId,
              raw: line.unitPrice,
            });
          }
          unitPrice = parsed.value;
        }

        lines.push({
          product,
          quantity: quantity.value,
          ...(unitPrice ? { unitPrice } : {}),
          ...(line.discountBp !== undefined ? { discountBp: line.discountBp } : {}),
        });
      }

      // La numeracion se consume con bloqueo dentro de la transaccion. Sin el, dos
      // ventas simultaneas obtendrian el mismo correlativo.
      const number = await repos.sequences.next('delivery_note');

      // El dominio decide: valida, calcula totales y descuenta el stock de una vez.
      const created = DeliveryNote.issue({
        id: asId<DeliveryNoteId>(deps.ids.next()),
        tenantId: deps.ctx.tenantId,
        number,
        customerId: customer.id,
        lines,
        exchangeRate,
        currency: baseCurrency,
        taxLabel: deps.ctx.settings.taxLabel,
        taxRateBp: deps.ctx.settings.taxRateBp,
        issuedAt: deps.clock.now(),
        issuedBy: deps.ctx.actor.userId,
        notes: input.notes ?? null,
      });
      if (!created.ok) return created;

      const note = created.value;

      // El credito se comprueba con el total ya calculado. El saldo pendiente vive en
      // otro agregado, asi que lo aporta el caso de uso: el cliente no puede conocerlo
      // por si mismo sin acoplarse a las cuentas por cobrar.
      const balance = await repos.payments.outstandingBalanceFor(customer.id, baseCurrency);
      if (!customer.canAfford(balance, note.totals.total)) {
        return err({ kind: 'CreditLimitExceeded', customerId: input.customerId });
      }

      // Escritura atomica. Los productos se guardan con su stock ya modificado y sus
      // movimientos pendientes: el repositorio los recoge con pullStockMovements().
      await repos.deliveryNotes.save(note);
      await repos.products.saveMany([...byId.values()]);
      await repos.usage.increment('documents_month');
      await repos.audit.record({
        action: 'delivery_note.issued',
        entityType: 'delivery_note',
        entityId: note.id,
        summary: {
          number: note.number,
          customer: customer.name,
          total: note.totals.total.toString(),
          exchangeRate: note.exchangeRate.toCompactString(),
        },
      });

      return ok({
        id: note.id,
        number: note.number,
        total: note.totals.total.toString(),
        totalInSecondaryCurrency: note.totals.totalInSecondaryCurrency.toString(),
      });
    });
  };
}
