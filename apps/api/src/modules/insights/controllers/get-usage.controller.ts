import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { usageQuerySchema } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1')
export class GetUsageController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('usage')
  @RequirePermission('report:read')
  @ApiOperation({ summary: 'Consumo actual del plan, por recurso' })
  async run(
    @Query(new ZodValidationPipe(usageQuerySchema)) query: z.infer<typeof usageQuerySchema>,
  ): Promise<Record<string, number>> {
    const counts = await Promise.all(
      query.resources.map(
        async (resource) => [resource, await this.runtime.queries.usage.current(resource)] as const,
      ),
    );
    return Object.fromEntries(counts);
  }
}
