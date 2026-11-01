import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { updateProductBodySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class UpdateProductController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch(':id')
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Corregir la ficha de un producto' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductBodySchema))
    body: z.infer<typeof updateProductBodySchema>,
  ): Promise<{ id: string; sku: string }> {
    return unwrapOrThrow(
      await this.useCases.updateProduct({
        productId: id,
        name: body.name,
        price: body.price,
        unit: body.unit || null,
        cost: body.cost || null,
        minStock: body.minStock || null,
        description: body.description || null,
        ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
      }),
    );
  }
}
