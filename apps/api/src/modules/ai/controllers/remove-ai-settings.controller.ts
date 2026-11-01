import { Controller, Delete, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/ai')
export class RemoveAiSettingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Delete('settings')
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Desconectar el asistente de su proveedor' })
  async run(): Promise<{ removed: boolean }> {
    return unwrapOrThrow(await this.useCases.removeAiSettings());
  }
}
