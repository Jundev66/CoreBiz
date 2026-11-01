import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AiSettingsView } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/ai')
export class GetAiSettingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Get('settings')
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Proveedor de IA configurado, sin la clave' })
  async run(): Promise<{ settings: AiSettingsView | null }> {
    return { settings: unwrapOrThrow(await this.useCases.getAiSettings()) };
  }
}
