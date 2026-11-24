import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { recordPartnerCashDrawingSchema, type PartnerDrawingResponseDto } from '@corebiz/contracts';
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
export class RecordPartnerCashDrawingController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('cash')
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Registrar retiro de efectivo por socio o accionista' })
  async run(
    @Body(new ZodValidationPipe(recordPartnerCashDrawingSchema))
    body: z.infer<typeof recordPartnerCashDrawingSchema>,
  ): Promise<PartnerDrawingResponseDto> {
    const drawingId = randomUUID();
    const parsedAmount = Money.of(body.amount, body.currency);
    const amountMinor = parsedAmount.ok ? parsedAmount.value.minorUnits : 0n;

    const result = await this.useCases.recordPartnerCashDrawing.execute({
      id: drawingId,
      tenantId: this.ctx.tenantId,
      date: body.date,
      partnerId: body.partnerId,
      partnerName: body.partnerName,
      drawingAccountId: body.drawingAccountId,
      cashAccountId: body.cashAccountId,
      currency: body.currency,
      amountMinor,
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
      operatorUserId: drawing.operatorUserId,
      notes: drawing.notes,
      journalEntryId: drawing.journalEntryId,
      status: drawing.status,
      createdAt: drawing.createdAt.toISOString(),
    };
  }
}
