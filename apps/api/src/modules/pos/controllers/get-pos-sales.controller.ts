import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { asId, type PosSaleId } from '@corebiz/domain';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { RUNTIME } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos/sales')
export class GetPosSalesController {
  constructor(@Inject(RUNTIME) private readonly runtime: Runtime) {}

  @Get()
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'Listar ventas de mostrador / tickets POS' })
  async list(@Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    return this.runtime.uow.run(async (repos) => {
      const sales = await repos.posSales.list({ limit });
      return sales.map((s) => ({
        id: s.id,
        ticketNumber: s.ticketNumber,
        status: s.status,
        paymentMethod: s.paymentMethod,
        subtotal: s.subtotal.toString(),
        tax: s.tax.toString(),
        total: s.total.toString(),
        linesCount: s.lines.length,
        occurredAt: s.occurredAt.toISOString(),
        postedAt: s.postedAt.toISOString(),
        lines: s.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.temporaryName ?? l.barcodeScanned ?? 'Producto',
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
      }));
    });
  }

  @Get(':id')
  @RequirePermission('delivery_note:read')
  @ApiOperation({ summary: 'Obtener detalle de una venta de mostrador / ticket POS' })
  async byId(@Param('id') id: string) {
    return this.runtime.uow.run(async (repos) => {
      const sale = await repos.posSales.findById(asId<PosSaleId>(id));
      if (!sale) {
        throw new NotFoundException({ errorKind: 'SaleNotFound', errorParams: { id } });
      }

      return {
        id: sale.id,
        ticketNumber: sale.ticketNumber,
        status: sale.status,
        paymentMethod: sale.paymentMethod,
        subtotal: sale.subtotal.toString(),
        tax: sale.tax.toString(),
        total: sale.total.toString(),
        occurredAt: sale.occurredAt.toISOString(),
        postedAt: sale.postedAt.toISOString(),
        lines: sale.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.temporaryName ?? l.barcodeScanned ?? 'Producto',
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
      };
    });
  }
}
