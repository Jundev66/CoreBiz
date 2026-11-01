import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { aiDraftSchema } from '@corebiz/contracts';
import type { AiModel } from '@corebiz/application';
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
export class ListAiModelsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('models')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: 'Modelos que puede usar esa clave, preguntados al proveedor' })
  async run(
    @Body(new ZodValidationPipe(aiDraftSchema)) body: z.infer<typeof aiDraftSchema>,
  ): Promise<{ models: readonly AiModel[] }> {
    return { models: unwrapOrThrow(await this.useCases.listAiModels(body)) };
  }
}
