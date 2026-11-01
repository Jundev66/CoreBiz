import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { auditExportQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { TenantContext } from '@corebiz/application';
import type { Runtime } from '../../../composition/runtime.provider';
import type { UseCases } from '../../../composition/use-cases.provider';

function escapeCsv(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class ExportAuditCsvController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get('audit/export')
  @RequirePermission('audit:export')
  @RequireFeature('audit_export')
  @ApiOperation({ summary: 'El registro de auditoria completo, en CSV' })
  async run(
    @Query(new ZodValidationPipe(auditExportQuerySchema))
    query: z.infer<typeof auditExportQuerySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const page = await this.runtime.queries.admin.auditLog({
      ...withoutUndefined({ action: query.action, from: query.from, to: query.to }),
      limit: 5_000,
    });

    const rows = page.items.map((entry) => [
      entry.occurredAt.toISOString(),
      entry.actorEmail ?? '',
      entry.action,
      entry.entityType ?? '',
      entry.entityId ?? '',
      entry.summary === null ? '' : JSON.stringify(entry.summary),
    ]);

    const header = ['fecha', 'actor', 'accion', 'entidad', 'identificador', 'detalle'];
    const stamp = new Date().toISOString().slice(0, 10);

    const filters: Record<string, string> = {
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.from !== undefined ? { from: query.from.toISOString() } : {}),
      ...(query.to !== undefined ? { to: query.to.toISOString() } : {}),
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="auditoria-${this.ctx.tenantSlug}-${stamp}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');

    await this.useCases.recordAuditExport({
      rowCount: rows.length,
      ...(Object.keys(filters).length > 0 ? { filters: filters } : {}),
    });

    return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  }
}
