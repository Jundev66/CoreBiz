import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { saveAiSettingsSchema } from '@corebiz/contracts';
import type { AiSettingsView } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('asistente')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/ai')
export class SaveAiSettingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Guardar el proveedor de IA, comprobado antes contra el proveedor' })
  async run(
    @Body(new ZodValidationPipe(saveAiSettingsSchema)) body: z.infer<typeof saveAiSettingsSchema>,
  ): Promise<{ settings: AiSettingsView }> {
    return { settings: unwrapOrThrow(await this.useCases.saveAiSettings(body)) };
  }
}
