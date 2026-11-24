import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PartnerDrawingResponseDto } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/drawings')
export class ListPartnerDrawingsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar retiros de efectivo y autoconsumo de socios' })
  async list(): Promise<readonly PartnerDrawingResponseDto[]> {
    const list = await this.useCases.listPartnerDrawings.execute(this.ctx.tenantId);

    return list.map((drawing) => ({
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
    }));
  }
}
