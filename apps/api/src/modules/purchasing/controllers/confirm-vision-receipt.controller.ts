import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { confirmVisionReceiptSchema } from '@corebiz/contracts';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class ConfirmVisionReceiptController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('receipts/confirm-vision')
  @RequirePermission('purchase:receive')
  @ApiOperation({ summary: 'Registrar recepción atómica a partir de la confirmación de Visión' })
  async run(
    @Body(new ZodValidationPipe(confirmVisionReceiptSchema))
    body: z.infer<typeof confirmVisionReceiptSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.confirmVisionReceipt({
        supplierDecision: body.supplierDecision,
        linesDecision: body.linesDecision,
        documentMetadata: body.documentMetadata,
      }),
    );
  }
}
