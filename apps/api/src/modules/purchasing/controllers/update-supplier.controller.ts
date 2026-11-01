import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { updateSupplierBodySchema } from '@corebiz/contracts';
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
export class UpdateSupplierController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch('suppliers/:id')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Corregir la ficha de un proveedor' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierBodySchema))
    body: z.infer<typeof updateSupplierBodySchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.updateSupplier({
        supplierId: id,
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
