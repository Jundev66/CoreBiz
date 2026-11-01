import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import type { AuditEntryView, Page } from '@corebiz/application';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { auditQuerySchema, withoutUndefined } from '../../../http/list-queries';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('administracion')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@Controller('v1/administration')
export class GetAuditLogController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get('audit')
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Registro de auditoria, del mas reciente al mas antiguo' })
  run(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ): Promise<Page<AuditEntryView>> {
    return this.runtime.queries.admin.auditLog(withoutUndefined(query));
  }
}
