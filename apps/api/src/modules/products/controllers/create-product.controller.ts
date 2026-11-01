import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createProductSchema } from '@corebiz/contracts';
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
export class CreateProductController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post()
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Dar de alta un producto' })
  async run(
    @Body(new ZodValidationPipe(createProductSchema)) body: z.infer<typeof createProductSchema>,
  ): Promise<{ id: string; sku: string }> {
    return unwrapOrThrow(
      await this.useCases.createProduct({
        sku: body.sku || null,
        name: body.name,
        price: body.price,
        ...(body.unit ? { unit: body.unit } : {}),
        cost: body.cost || null,
        initialStock: body.initialStock || null,
        minStock: body.minStock || null,
        ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
        ...(body.trackStock !== undefined ? { trackStock: body.trackStock } : {}),
      }),
    );
  }
}
