import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import {
  createSupplierSchema,
  updateSupplierBodySchema,
  receiveGoodsSchema,
  setStatusSchema,
  voidGoodsReceiptSchema,
} from '@corebiz/contracts';
import type {
  GoodsReceiptListItem,
  GoodsReceiptView,
  Page,
  SupplierListItem,
  SupplierDetail,
  SupplierOption,
} from '@corebiz/application';
import { FeatureGuard } from '../../auth/feature.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequireFeature } from '../../auth/require-feature.decorator';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import {
  optionsQuerySchema,
  receiptListQuerySchema,
  supplierListQuerySchema,
  withoutUndefined,
} from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

/**
 * Compras y proveedores.
 *
 * El modulo entero esta reservado al plan PRO. En las ESCRITURAS la autoridad sigue
 * siendo el caso de uso, que devuelve `FeatureNotAvailable` por su cuenta; el guard
 * solo se adelanta para no abrir una transaccion. En las LECTURAS no hay caso de uso
 * por el que pasar, asi que el guard es la autoridad — ver `feature.guard.ts`.
 *
 * El guard de permisos comprueba el ROL, que es otra cosa: un propietario del plan
 * gratuito tiene el permiso y aun asi recibe `FeatureNotAvailable`, que es lo que
 * permite a la interfaz ofrecer subir de plan en lugar de decir "no tienes permiso",
 * que seria mentira.
 */
@ApiTags('compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, FeatureGuard)
// El modulo entero, lecturas incluidas. Los casos de uso ya gatean las escrituras;
// esto cierra las consultas, que no pasan por ninguno.
@RequireFeature('purchasing')
@Controller('v1/purchasing')
export class PurchasingController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
  ) {}

  @Get('suppliers')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Listado de proveedores' })
  suppliers(
    @Query(new ZodValidationPipe(supplierListQuerySchema))
    query: z.infer<typeof supplierListQuerySchema>,
  ): Promise<Page<SupplierListItem>> {
    return this.runtime.queries.purchasing.suppliers(withoutUndefined(query));
  }

  @Get('suppliers/options')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Lo justo para un desplegable' })
  supplierOptions(
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.infer<typeof optionsQuerySchema>,
  ): Promise<readonly SupplierOption[]> {
    return this.runtime.queries.purchasing.supplierOptions(query.limit);
  }

  /**
   * Ficha completa de un proveedor.
   *
   * Declarada DESPUES de `suppliers/options` a proposito: Express resuelve por orden de
   * declaracion, y con esta delante una peticion a `/suppliers/options` entraria por
   * aqui buscando un proveedor llamado "options" y respondiendo 404.
   */
  @Get('suppliers/:id')
  @RequirePermission('supplier:read')
  @ApiOperation({ summary: 'Ficha completa de un proveedor' })
  async supplierById(@Param('id') id: string): Promise<SupplierDetail> {
    const supplier = await this.runtime.queries.purchasing.supplierById(id);
    // 404 tanto si no existe como si es de otra empresa: un 403 confirmaria que ese
    // identificador existe en alguna parte.
    if (supplier === null) {
      throw new NotFoundException({ errorKind: 'SupplierNotFound', errorParams: { id } });
    }
    return supplier;
  }

  @Post('suppliers')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Dar de alta un proveedor' })
  async createSupplier(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: z.infer<typeof createSupplierSchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.createSupplier({
        name: body.name,
        taxId: body.taxId || null,
        email: body.email || null,
        phone: body.phone || null,
        contactName: body.contactName || null,
        notes: body.notes || null,
      }),
    );
  }

  @Patch('suppliers/:id')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Corregir la ficha de un proveedor' })
  async updateSupplier(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierBodySchema))
    body: z.infer<typeof updateSupplierBodySchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.updateSupplier({
        supplierId: id,
        name: body.name,
        taxId: body.taxId || null,
        email: body.email || null,
        phone: body.phone || null,
        contactName: body.contactName || null,
        notes: body.notes || null,
      }),
    );
  }

  @Patch('suppliers/:id/status')
  @RequirePermission('supplier:write')
  @ApiOperation({ summary: 'Archivar un proveedor, o devolverlo a la lista' })
  async setSupplierStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ): Promise<{ archived: boolean }> {
    return unwrapOrThrow(
      await this.useCases.setSupplierStatus({ supplierId: id, archived: body.archived }),
    );
  }

  @Get('receipts')
  @RequirePermission('purchase:read')
  @ApiOperation({ summary: 'Recepciones de mercancia' })
  receipts(
    @Query(new ZodValidationPipe(receiptListQuerySchema))
    query: z.infer<typeof receiptListQuerySchema>,
  ): Promise<Page<GoodsReceiptListItem>> {
    return this.runtime.queries.purchasing.receipts(withoutUndefined(query));
  }

  @Get('receipts/:id')
  @RequirePermission('purchase:read')
  @ApiOperation({ summary: 'Una recepcion con su detalle' })
  async receiptById(@Param('id') id: string): Promise<GoodsReceiptView> {
    const receipt = await this.runtime.queries.purchasing.receiptById(id);
    if (receipt === null) {
      throw new NotFoundException({ errorKind: 'GoodsReceiptNotFound', errorParams: { id } });
    }
    return receipt;
  }

  @Post('receipts')
  @RequirePermission('purchase:receive')
  @ApiOperation({ summary: 'Registrar la entrada de mercancia y actualizar el inventario' })
  async receiveGoods(
    @Body(new ZodValidationPipe(receiveGoodsSchema)) body: z.infer<typeof receiveGoodsSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.receiveGoods({
        supplierId: body.supplierId,
        lines: body.lines,
        supplierReference: body.supplierReference || null,
        notes: body.notes || null,
      }),
    );
  }

  /**
   * Anular una recepcion. POST sobre una subruta, no DELETE — igual que en ventas.
   *
   * Una recepcion anulada no desaparece: conserva su numero, quita del inventario lo que
   * habia entrado y guarda el motivo. `DELETE` prometeria que deja de existir.
   *
   * Puede responder 422 aunque el documento sea anulable: si la mercancia recibida ya se
   * vendio, el saldo no da para deshacer la entrada. Es la diferencia real con anular una
   * venta, donde devolver al inventario siempre se puede.
   */
  @Post('receipts/:id/void')
  // 200 y no 201: anular no crea nada. La recepcion que ya existia cambia de estado.
  @HttpCode(HttpStatus.OK)
  @RequirePermission('purchase:void')
  @ApiOperation({ summary: 'Anular una recepcion, quitando del inventario lo que entro' })
  async voidReceipt(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidGoodsReceiptSchema))
    body: z.infer<typeof voidGoodsReceiptSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.voidGoodsReceipt({ goodsReceiptId: id, reason: body.reason }),
    );
  }
}
