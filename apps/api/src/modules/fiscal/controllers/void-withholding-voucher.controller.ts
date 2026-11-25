import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { voidWithholdingVoucherSchema } from '@corebiz/contracts';
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
@Controller('v1/fiscal/withholdings')
export class VoidWithholdingVoucherController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post(':id/void')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Anular comprobante de retencion fiscal' })
  async run(
    @Param('id') voucherId: string,
    @Body(new ZodValidationPipe(voidWithholdingVoucherSchema))
    body: z.infer<typeof voidWithholdingVoucherSchema>,
  ) {
    const result = await this.useCases.voidWithholdingVoucher.execute({
      tenantId: this.ctx.tenantId,
      voucherId,
      reason: body.reason,
    });

    const val = unwrapOrThrow(result);
    return {
      voucherId: val.voucherId,
      status: val.status,
    };
  }
}
