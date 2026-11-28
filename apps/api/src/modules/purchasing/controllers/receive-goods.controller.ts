import { Body, Controller, Inject, Optional, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { receiveGoodsSchema } from '@corebiz/contracts';
import { Money } from '@corebiz/domain';
import { FeatureGuard } from '../../../auth/feature.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequireFeature } from '../../../auth/require-feature.decorator';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class ReceiveGoodsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Optional() @Inject(RUNTIME) private readonly runtime?: Runtime,
  ) {}

  @Post('receipts')
  @RequirePermission('purchase:receive')
  @ApiOperation({ summary: 'Registrar la entrada de mercancia y actualizar el inventario' })
  async run(
    @Body(new ZodValidationPipe(receiveGoodsSchema)) body: z.infer<typeof receiveGoodsSchema>,
  ): Promise<unknown> {
    const out = unwrapOrThrow(
      await this.useCases.receiveGoods({
        supplierId: body.supplierId,
        lines: body.lines,
        supplierReference: body.supplierReference || null,
        controlNumber: body.controlNumber || null,
        ...(body.paymentCondition ? { paymentCondition: body.paymentCondition } : {}),
        ...(body.creditDays !== undefined ? { creditDays: body.creditDays } : {}),
        ...(body.taxPercentage !== undefined ? { taxPercentage: body.taxPercentage } : {}),
        ...(body.currency ? { currency: body.currency } : {}),
        officialRate: body.officialRate || null,
        appliedRate: body.appliedRate || null,
        notes: body.notes || null,
      }),
    );

    if (body.paymentCondition === 'CREDIT' && this.runtime) {
      const currency = body.currency ?? 'USD';
      const parsedSub = Money.of(out.total, currency);
      const subMinor = parsedSub.ok ? parsedSub.value.minorUnits : 0n;
      const taxBp = BigInt(Math.round((body.taxPercentage ?? 0) * 100));
      const totalMinor = subMinor + (subMinor * taxBp) / 10000n;
      if (totalMinor > 0n) {
        await this.runtime.documentPayments.createInstallmentSchedule({
          documentType: 'PURCHASE',
          documentId: out.id,
          frequency: body.installmentFrequency ?? 'SINGLE',
          count: body.installmentCount ?? 1,
          startDate: new Date(),
          creditDays: body.creditDays ?? 30,
          currency,
          totalMinor,
        });
      }
    }

    return out;
  }
}
