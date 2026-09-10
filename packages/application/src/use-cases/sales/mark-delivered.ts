import {
  ok,
  err,
  can,
  asId,
  type Result,
  type DeliveryNoteId,
  type DeliveryNoteError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: confirmar que el cliente recibio la mercancia.
 *
 * Cierra la maquina de estados de la venta. Hasta ahora una nota emitida solo podia
 * acabar anulada: `delivered` era un estado que la base admitia, el dominio sabia
 * alcanzar y la aplicacion no podia producir.
 *
 * NO TOCA EL INVENTARIO, y eso es lo importante de este paso. El stock salio al EMITIR,
 * cuando la mercancia dejo el almacen; confirmar la entrega solo registra que llego a su
 * destino. Descontar aqui la restaria dos veces.
 *
 * Es la unica operacion sobre un documento de venta que ALMACEN puede hacer, y tiene
 * sentido: quien mueve las cajas es quien sabe que se entregaron. Vender lo hace ventas,
 * anular lo hace quien manda, y confirmar la entrega lo hace quien estaba alli.
 */

export interface MarkDeliveredInput {
  readonly deliveryNoteId: string;
  /** Quien firmo el recibo. Puede no haberlo: una entrega en mostrador no siempre lo tiene. */
  readonly receivedBy: string | null;
}

export type MarkDeliveredError =
  | { kind: 'Forbidden' }
  | { kind: 'DeliveryNoteNotFound'; deliveryNoteId: string }
  | DeliveryNoteError;

export interface MarkDeliveredDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeMarkDelivered(deps: MarkDeliveredDeps) {
  return async function markDelivered(
    input: MarkDeliveredInput,
  ): Promise<Result<{ number: string }, MarkDeliveredError>> {
    if (!can(deps.ctx.actor, 'delivery_note:deliver')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const note = await repos.deliveryNotes.findById(asId<DeliveryNoteId>(input.deliveryNoteId));
      if (!note) {
        return err({ kind: 'DeliveryNoteNotFound', deliveryNoteId: input.deliveryNoteId });
      }

      // El agregado decide si la transicion vale. Una nota ya entregada, o anulada, la
      // rechaza con `InvalidTransition` diciendo desde donde y hacia donde.
      const marked = note.markDelivered(deps.clock.now(), input.receivedBy);
      if (!marked.ok) return marked;

      await repos.deliveryNotes.save(note);
      await repos.audit.record({
        action: 'delivery_note.delivered',
        entityType: 'delivery_note',
        entityId: note.id,
        summary: {
          number: note.number,
          receivedBy: input.receivedBy ?? '',
        },
      });

      return ok({ number: note.number });
    });
  };
}
