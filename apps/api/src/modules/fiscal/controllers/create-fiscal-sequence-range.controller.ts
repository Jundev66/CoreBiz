import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createFiscalSequenceRangeSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('fiscal')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/fiscal/sequences')
export class CreateFiscalSequenceRangeController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar un rango de numeracion o control fiscal autorizado' })
  async run(
    @Body(new ZodValidationPipe(createFiscalSequenceRangeSchema))
    body: z.infer<typeof createFiscalSequenceRangeSchema>,
  ) {
    const result = await this.useCases.createFiscalSequenceRange.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      jurisdiction: body.jurisdiction,
      documentType: body.documentType,
      prefix: body.prefix,
      fromNumber: BigInt(body.fromNumber),
      toNumber: BigInt(body.toNumber),
      resolutionNumber: body.resolutionNumber,
      resolutionDate: body.resolutionDate,
      expiresAt: body.expiresAt,
      warningThreshold: body.warningThreshold,
    });

    const val = unwrapOrThrow(result);
    return {
      rangeId: val.rangeId,
      status: val.status,
    };
  }
}
