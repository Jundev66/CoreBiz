import { BadRequestException, NotFoundException } from '@nestjs/common';
import { asId, type DeliveryNoteId } from '@corebiz/domain';
import type { Runtime } from '../../../composition/runtime.provider';

export function extractString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

export async function deliverNoteIntegration(
  runtime: Runtime,
  idOrNumber: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
  const actor = extractString(body.confirmedBy) || extractString(body.receivedBy) || 'ConciliaBot';

  return runtime.uow.run(async (repos) => {
    let note = await repos.deliveryNotes.findById(asId<DeliveryNoteId>(idOrNumber));
    if (!note) {
      note = await repos.deliveryNotes.findByNumber(idOrNumber);
    }
    if (!note) {
      throw new NotFoundException({
        errorKind: 'DeliveryNoteNotFound',
        errorParams: { idOrNumber },
      });
    }

    if (note.status === 'delivered') {
      return {
        ok: true,
        id: note.id,
        number: note.number,
        status: 'delivered',
        message: `Nota ${note.number} ya se encontraba confirmada en CoreBiz.`,
      };
    }

    const marked = note.markDelivered(new Date(), actor);
    if (!marked.ok) {
      throw new BadRequestException({
        errorKind: marked.error.kind,
        errorParams: marked.error,
      });
    }

    await repos.deliveryNotes.save(note);
    await repos.audit.record({
      action: 'delivery_note.delivered',
      entityType: 'delivery_note',
      entityId: note.id,
      summary: {
        number: note.number,
        receivedBy: actor,
        source: 'conciliabot_integration',
      },
    });

    return {
      ok: true,
      id: note.id,
      number: note.number,
      status: 'delivered',
      message: `Nota de entrega ${note.number} registrada y confirmada exitosamente en CoreBiz.`,
    };
  });
}
