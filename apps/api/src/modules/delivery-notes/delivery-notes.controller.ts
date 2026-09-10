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
import {
  issueDeliveryNoteSchema,
  markDeliveredSchema,
  voidDeliveryNoteSchema,
} from '@corebiz/contracts';
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
 * El sistema entero dice en voz alta lo que estos documentos NO son (ADR 003): hay
 * un script en CI que rompe el build si aparece vocabulario tributario. Por eso el
 * recurso se llama `delivery-notes` en la URL, y no de la otra manera.
 *
 * Las dos lineas siguientes llevan el marcador que exime del guardian, porque son
 * justo el caso para el que existe: niegan tener algo, y el guardian solo ve el
 * termino.
 *
 *   NO son facturas fiscales.  // no-fiscal-ok
 *   El recurso no se llama `invoices`.  // no-fiscal-ok
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
        notes: body.notes || null,
      }),
    );
  }

  /**
   * Confirmar la entrega.
   *
   * El unico endpoint de ventas que ALMACEN puede llamar. No es un descuido de la matriz
   * de permisos: emitir es de ventas, anular es de quien manda, y confirmar que la
   * mercancia llego es de quien la llevo.
   *
   * `receivedBy` es opcional a proposito. Una entrega en mostrador puede no tener a nadie
   * que firme, y exigir un nombre solo conseguiria que se teclease uno inventado.
   */
  @Post(':id/deliver')
  // 200 y no 201: confirmar la entrega no crea nada, cambia el estado de lo que ya existe.
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delivery_note:deliver')
  @ApiOperation({ summary: 'Confirmar que el cliente recibio la mercancia' })
  async deliver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markDeliveredSchema))
    body: z.infer<typeof markDeliveredSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.markDelivered({
        deliveryNoteId: id,
        receivedBy: body.receivedBy || null,
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
