import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { createSupplierSchema } from '@corebiz/contracts';
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
export class CreateSupplierController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('suppliers')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Dar de alta un proveedor' })
  async run(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: z.infer<typeof createSupplierSchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.createSupplier({
        name: body.name,
        taxId: body.taxId || null,
        email: body.email || null,
        phone: body.phone || null,
        contactName: body.contactName || null,
        notes: body.notes || null,
      }),
    );
  }
}
