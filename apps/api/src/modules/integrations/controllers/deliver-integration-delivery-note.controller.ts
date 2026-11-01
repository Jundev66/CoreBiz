import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
import { deliverNoteIntegration } from './deliver-note.helper';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class DeliverIntegrationDeliveryNoteController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Post('delivery-notes/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar como entregada una nota de entrega' })
  async run(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: string; number: string; status: string; message: string }> {
    return deliverNoteIntegration(this.runtime, id, body);
  }
}
