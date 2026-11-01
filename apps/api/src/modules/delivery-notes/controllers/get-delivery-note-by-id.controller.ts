import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DeliveryNoteView } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('ventas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/delivery-notes')
export class GetDeliveryNoteByIdController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get(':id')
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'La nota completa, con sus lineas y su tasa congelada' })
  async run(@Param('id') id: string): Promise<DeliveryNoteView> {
    const note = await this.runtime.queries.deliveryNotes.findById(id);
    if (note === null) {
      throw new NotFoundException({ errorKind: 'DeliveryNoteNotFound', errorParams: { id } });
    }
    return note;
  }
}
