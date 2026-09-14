import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { SalesReport } from '@corebiz/application';
import { FeatureGuard } from '../../auth/feature.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequireFeature } from '../../auth/require-feature.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { usageQuerySchema } from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';

/**
 * Reportes y consumo del plan.
 *
 * Van juntos porque los dos son cifras agregadas que no pertenecen a ningun agregado
 * del dominio: nadie "crea" un reporte ni "edita" un contador de uso.
 */
@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1')
export class InsightsController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('reports/sales-summary')
  @RequirePermission('report:read')
  // El modulo de reportes es PRO. Antes esto se comprobaba solo en la pagina, y al
  // exponer la consulta por HTTP el plan gratuito la alcanzaba directamente.
  @RequireFeature('reports')
  @ApiOperation({ summary: 'Resumen de ventas del periodo' })
  salesSummary(): Promise<SalesReport> {
    return this.runtime.queries.reports.salesSummary();
  }

  /**
   * Consumo actual de varios recursos en UNA llamada.
   *
   * A list is accepted rather than one resource per request because the header paints
   * several quotas at once: with one endpoint per resource, each screen would make three or
   * four trips to the API just to draw the usage bar.
   */
  @Get('usage')
  @RequirePermission('report:read')
  @ApiOperation({ summary: 'Consumo actual del plan, por recurso' })
  async usage(
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
