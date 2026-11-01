import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AssistantStatus } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/assistant')
export class GetAssistantStatusController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Get('status')
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Si hay IA configurada y si quien pregunta puede configurarla' })
  async run(): Promise<AssistantStatus> {
    return unwrapOrThrow(await this.useCases.assistantStatus());
  }
}
