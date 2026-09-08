import {
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
import { issueDeliveryNoteSchema, voidDeliveryNoteSchema } from '@corebiz/contracts';
import type { DeliveryNoteListItem, DeliveryNoteView, Page } from '@corebiz/application';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import { deliveryNoteListQuerySchema, withoutUndefined } from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

/**
 * Notas de entrega.
 *
 * NO son facturas fiscales y el sistema entero lo dice en voz alta (ADR 003): hay un
 * script en CI que rompe el build si aparece vocabulario tributario. Por eso el
 * recurso se llama `delivery-notes` y no `invoices`, tambien en la URL.
 */
@ApiTags('ventas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/delivery-notes')
export class DeliveryNotesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
  ) {}

  @Get()
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'Listado de notas emitidas' })
  list(
    @Query(new ZodValidationPipe(deliveryNoteListQuerySchema))
    query: z.infer<typeof deliveryNoteListQuerySchema>,
  ): Promise<Page<DeliveryNoteListItem>> {
    return this.runtime.queries.deliveryNotes.list(withoutUndefined(query));
  }

  @Get(':id')
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'La nota completa, con sus lineas y su tasa congelada' })
  async byId(@Param('id') id: string): Promise<DeliveryNoteView> {
    const note = await this.runtime.queries.deliveryNotes.findById(id);
    if (note === null) {
      throw new NotFoundException({ errorKind: 'DeliveryNoteNotFound', errorParams: { id } });
    }
    return note;
  }

  @Post()
  @RequirePermission('delivery_note:issue')
  @ApiOperation({ summary: 'Emitir una nota de entrega' })
  async issue(
    @Body(new ZodValidationPipe(issueDeliveryNoteSchema))
    body: z.infer<typeof issueDeliveryNoteSchema>,
  ): Promise<{ id: string; number: string }> {
    return unwrapOrThrow(
      await this.useCases.issueDeliveryNote({
        customerId: body.customerId,
        lines: body.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}),
          ...(line.discountBp !== undefined ? { discountBp: line.discountBp } : {}),
        })),
        quoteId: body.quoteId || null,
        notes: body.notes || null,
      }),
    );
  }

  /**
   * Anular. Es un POST sobre una subruta y NO un DELETE.
   *
   * Una nota anulada no desaparece: conserva su numero —la numeracion es continua y un
   * hueco es lo primero que mira una inspeccion— devuelve el stock y guarda el motivo.
   * `DELETE` prometeria que deja de existir, y seria mentira.
   */
  @Post(':id/void')
  // 200 y no 201: anular no crea nada. La nota que ya existia cambia de estado.
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delivery_note:void')
  @ApiOperation({ summary: 'Anular una nota emitida, devolviendo el inventario' })
  async void(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidDeliveryNoteSchema))
    body: z.infer<typeof voidDeliveryNoteSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.voidDeliveryNote({ deliveryNoteId: id, reason: body.reason }),
    );
  }
}
