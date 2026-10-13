import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { DeliveryNoteListItem, DeliveryNoteView, Page } from '@corebiz/application';
import { asId, type DeliveryNoteId } from '@corebiz/domain';
import { IntegrationsApiKeyGuard } from '../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../auth/integrations-throttle.guard';
import { deliveryNoteListQuerySchema, withoutUndefined } from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { INTEGRATIONS_RUNTIME } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';

/**
 * Integracion para un servicio externo de conciliacion (ConciliaBot).
 *
 * No hay usuario detras: la credencial es la clave compartida que valida
 * `IntegrationsApiKeyGuard`, y el tenant sale de la configuracion, no de una cabecera.
 * Por eso estas rutas quedan FUERA de `AuthMiddleware` en `app.module.ts` y no pasan por
 * `RUNTIME`/`TENANT_CONTEXT`, que dependen de una identidad que aqui no existe.
 *
 * Permite leer notas de entrega para su cotejo y confirmar recepciones autorizadas
 * por el operador humano.
 *
 * `IntegrationsThrottleGuard` cubre estas rutas, que `ReadThrottleGuard` salta al no tener
 * identidad de usuario: acota el volumen por credencial y deja una linea de acceso en el log.
 */
function extractString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class IntegrationsController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Get('delivery-notes')
  @ApiOperation({ summary: 'Listado de notas de entrega para la conciliacion' })
  list(
    @Query(new ZodValidationPipe(deliveryNoteListQuerySchema))
    query: z.infer<typeof deliveryNoteListQuerySchema>,
  ): Promise<Page<DeliveryNoteListItem>> {
    return this.runtime.queries.deliveryNotes.list(withoutUndefined(query));
  }

  @Get('delivery-notes/:id')
  @ApiOperation({ summary: 'Una nota de entrega por identificador' })
  async byId(@Param('id') id: string): Promise<DeliveryNoteView> {
    const note = await this.runtime.queries.deliveryNotes.findById(id);
    if (note === null) {
      throw new NotFoundException({ errorKind: 'DeliveryNoteNotFound', errorParams: { id } });
    }
    return note;
  }

  @Post('delivery-notes/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar recepcion de mercancia de una nota de entrega' })
  async confirm(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
    return this.deliverNote(id, body);
  }

  @Post('delivery-notes/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar como entregada una nota de entrega' })
  async deliver(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
    return this.deliverNote(id, body);
  }

  @Post('delivery-notes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar y registrar nota de entrega' })
  async registerOrConfirm(
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
    const rawNumber = extractString(body.number) || extractString(body.folio);
    let noteId = extractString(body.id);

    if (!noteId && rawNumber) {
      const list = await this.runtime.queries.deliveryNotes.list({ limit: 100 });
      const found = list.items.find((item) => item.number === rawNumber);
      if (found) {
        noteId = found.id;
      }
    }

    const target = noteId || rawNumber;
    if (!target) {
      throw new BadRequestException({
        errorKind: 'MissingParameter',
        message: 'Se requiere id o number de la nota de entrega.',
      });
    }

    return this.deliverNote(target, body);
  }

  private async deliverNote(
    idOrNumber: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
    const actor =
      extractString(body.confirmedBy) || extractString(body.receivedBy) || 'ConciliaBot';

    return this.runtime.uow.run(async (repos) => {
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
}
