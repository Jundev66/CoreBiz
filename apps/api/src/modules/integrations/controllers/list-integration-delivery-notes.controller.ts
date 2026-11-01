import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { DeliveryNoteListItem, Page } from '@corebiz/application';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { deliveryNoteListQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class ListIntegrationDeliveryNotesController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Get('delivery-notes')
  @ApiOperation({ summary: 'Listado de notas de entrega para la conciliacion' })
  run(
    @Query(new ZodValidationPipe(deliveryNoteListQuerySchema))
    query: z.infer<typeof deliveryNoteListQuerySchema>,
  ): Promise<Page<DeliveryNoteListItem>> {
    return this.runtime.queries.deliveryNotes.list(withoutUndefined(query));
  }
}
