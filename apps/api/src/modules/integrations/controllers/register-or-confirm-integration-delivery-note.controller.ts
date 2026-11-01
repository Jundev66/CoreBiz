import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationsApiKeyGuard } from '../../../auth/integrations-api-key.guard';
import { IntegrationsThrottleGuard } from '../../../auth/integrations-throttle.guard';
import { INTEGRATIONS_RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
import { deliverNoteIntegration, extractString } from './deliver-note.helper';

@ApiTags('integraciones')
@ApiBearerAuth()
@UseGuards(IntegrationsApiKeyGuard, IntegrationsThrottleGuard)
@Controller('v1/integrations')
export class RegisterOrConfirmIntegrationDeliveryNoteController {
  constructor(@Inject(INTEGRATIONS_RUNTIME) private readonly runtime: Runtime) {}

  @Post('delivery-notes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar y registrar nota de entrega' })
  async run(
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

    return deliverNoteIntegration(this.runtime, target, body);
  }
}
