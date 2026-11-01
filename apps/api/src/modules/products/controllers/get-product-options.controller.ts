import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import type { ProductOption } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { optionsQuerySchema } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class GetProductOptionsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('options')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Lo justo para un desplegable' })
  run(
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.infer<typeof optionsQuerySchema>,
  ): Promise<readonly ProductOption[]> {
    return this.runtime.queries.products.options(query.limit);
  }
}
