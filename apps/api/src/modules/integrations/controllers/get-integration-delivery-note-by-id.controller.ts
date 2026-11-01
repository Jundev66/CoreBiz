import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DeliveryNoteView } from '@corebiz/application';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class GetIntegrationDeliveryNoteByIdController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Get('delivery-notes/:id')
  @ApiOperation({ summary: 'Una nota de entrega por identificador' })
  async run(@Param('id') id: string): Promise<DeliveryNoteView> {
    const note = await this.runtime.queries.deliveryNotes.findById(id);
    if (note === null) {
      throw new NotFoundException({ errorKind: 'DeliveryNoteNotFound', errorParams: { id } });
    }
    return note;
  }
}
