import {
  ok,
  err,
  can,
  asId,
  type Result,
  type DeliveryNoteId,
  type DeliveryNoteError,
  type Product,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: anular una nota de entrega y devolver la mercancia al inventario.
 *
 * Anular es una operacion privilegiada: un vendedor puede EMITIR pero no ANULAR,
 * porque anular revierte stock y altera el historico de ventas. Esa separacion vive en
 * la matriz de permisos, no en un condicional suelto.
 */

export interface VoidDeliveryNoteInput {
  readonly deliveryNoteId: string;
  readonly reason: string;
}

export type VoidDeliveryNoteError =
  | { kind: 'Forbidden' }
  | { kind: 'DeliveryNoteNotFound'; deliveryNoteId: string }
  | DeliveryNoteError;

export interface VoidDeliveryNoteDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeVoidDeliveryNote(deps: VoidDeliveryNoteDeps) {
  return async function voidDeliveryNote(
    input: VoidDeliveryNoteInput,
  ): Promise<Result<{ number: string }, VoidDeliveryNoteError>> {
    if (!can(deps.ctx.actor, 'delivery_note:void')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const note = await repos.deliveryNotes.findById(asId<DeliveryNoteId>(input.deliveryNoteId));
      if (!note) {
        return err({ kind: 'DeliveryNoteNotFound', deliveryNoteId: input.deliveryNoteId });
      }

      // Se cargan los productos que el documento toco para generar sobre ellos los
      // movimientos compensatorios. Un producto que ya no exista simplemente no
      // aparece en el mapa: el agregado lo tolera y la anulacion sigue adelante,
      // porque no poder anular por un producto borrado seria peor que la alternativa.
      const products = await repos.products.findManyByIds(note.productIds());
      const byId = new Map<string, Product>(products.map((p) => [p.id, p]));

      const voided = note.void(input.reason, deps.clock.now(), byId);
      if (!voided.ok) return voided;

      await repos.deliveryNotes.save(note);
      await repos.products.saveMany(products);
      await repos.audit.record({
        action: 'delivery_note.voided',
        entityType: 'delivery_note',
        entityId: note.id,
        summary: {
          number: note.number,
          reason: input.reason.trim(),
          restoredLines: note.lines.length,
        },
      });

      // El contador mensual NO se decrementa: el documento existio, se emitio y ocupo
      // un correlativo. Devolver la cuota permitiria emitir y anular en bucle para
      // saltarse el limite del plan.
      return ok({ number: note.number });
    });
  };
}
