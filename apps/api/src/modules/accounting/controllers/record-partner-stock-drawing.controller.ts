import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  recordPartnerStockDrawingSchema,
  type PartnerDrawingResponseDto,
} from '@corebiz/contracts';
import { Money } from '@corebiz/shared-kernel';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/drawings')
export class RecordPartnerStockDrawingController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('stock')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar autoconsumo o retiro de mercancía por socio' })
  async run(
    @Body(new ZodValidationPipe(recordPartnerStockDrawingSchema))
    body: z.infer<typeof recordPartnerStockDrawingSchema>,
  ): Promise<PartnerDrawingResponseDto> {
    const drawingId = randomUUID();
    const parsedCost = Money.of(body.unitCost, body.currency);
    const unitCostMinor = parsedCost.ok ? parsedCost.value.minorUnits : 0n;

    const result = await this.useCases.recordPartnerStockDrawing.execute({
      id: drawingId,
      tenantId: this.ctx.tenantId,
      date: body.date,
      partnerId: body.partnerId,
      partnerName: body.partnerName,
      drawingAccountId: body.drawingAccountId,
      inventoryAccountId: body.inventoryAccountId,
      currency: body.currency,
      productId: body.productId,
      quantity: body.quantity,
      unitCostMinor,
      operatorUserId: this.ctx.actor.userId,
      notes: body.notes,
    });

    const val = unwrapOrThrow(result);
    const drawing = val.drawing;

    return {
      id: drawing.id,
      tenantId: drawing.tenantId,
      drawingNumber: drawing.drawingNumber.toString(),
      drawingType: drawing.drawingType,
      date: drawing.date.toISOString(),
      partnerId: drawing.partnerId,
      partnerName: drawing.partnerName,
      drawingAccountId: drawing.drawingAccountId,
      creditAccountId: drawing.creditAccountId,
      currency: drawing.currency,
      amount: drawing.amount.toString(),
      productId: drawing.productId,
      quantity: drawing.quantity,
      unitCost: drawing.unitCost?.toString(),
      operatorUserId: drawing.operatorUserId,
      notes: drawing.notes,
      journalEntryId: drawing.journalEntryId,
      status: drawing.status,
      createdAt: drawing.createdAt.toISOString(),
    };
  }
}
