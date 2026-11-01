import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import type { DeliveryNoteListItem, Page } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { deliveryNoteListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('ventas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/delivery-notes')
export class ListDeliveryNotesController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'Listado de notas emitidas' })
  run(
    @Query(new ZodValidationPipe(deliveryNoteListQuerySchema))
    query: z.infer<typeof deliveryNoteListQuerySchema>,
  ): Promise<Page<DeliveryNoteListItem>> {
    return this.runtime.queries.deliveryNotes.list(withoutUndefined(query));
  }
}
