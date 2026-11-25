import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/sequences')
export class ListFiscalSequenceRangesController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar rangos de secuencias y vigencias fiscales' })
  async run() {
    const ranges = await this.useCases.listFiscalSequenceRanges.execute({
      tenantId: this.ctx.tenantId,
    });

    const now = new Date();
    return ranges.map((r) => ({
      id: r.id,
      jurisdiction: r.jurisdiction,
      documentType: r.documentType,
      prefix: r.prefix,
      fromNumber: r.fromNumber.toString(),
      toNumber: r.toNumber.toString(),
      currentNumber: r.currentNumber.toString(),
      remainingNumbers: r.remainingNumbers.toString(),
      resolutionNumber: r.resolutionNumber ?? null,
      resolutionDate: r.resolutionDate ? r.resolutionDate.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      warningThreshold: r.warningThreshold,
      status: r.status,
      isNearExhaustion: r.isNearExhaustion,
      isNearExpiration: r.isNearExpiration(now),
    }));
  }
}
