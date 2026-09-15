import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adjustStockSchema,
  createProductSchema,
  setStatusSchema,
  updateProductBodySchema,
} from '@corebiz/contracts';
import type {
  Page,
  ProductDetail,
  ProductListItem,
  ProductOption,
  StockMovementItem,
} from '@corebiz/application';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import {
  lowStockQuerySchema,
  optionsQuerySchema,
  productListQuerySchema,
  withoutUndefined,
} from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

const movementsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

@ApiTags('catalogo')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/products')
export class ProductsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
  ) {}

  @Get()
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Listado del catalogo' })
  list(
    @Query(new ZodValidationPipe(productListQuerySchema))
    query: z.infer<typeof productListQuerySchema>,
  ): Promise<Page<ProductListItem>> {
    return this.runtime.queries.products.list(withoutUndefined(query));
  }

  @Get('options')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Lo justo para un desplegable' })
  options(
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.infer<typeof optionsQuerySchema>,
  ): Promise<readonly ProductOption[]> {
    return this.runtime.queries.products.options(query.limit);
  }

  // Declared before `:id`, like `options`: a literal segment has to be matched first or
  // `low-stock` would be read as a product id.
  @Get('low-stock')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Productos por debajo de su minimo, para el panel' })
  lowStock(
    @Query(new ZodValidationPipe(lowStockQuerySchema)) query: z.infer<typeof lowStockQuerySchema>,
  ): Promise<readonly ProductListItem[]> {
    return this.runtime.queries.products.lowStock(query.limit);
  }

  @Get(':id')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Ficha del producto' })
  async byId(@Param('id') id: string): Promise<ProductDetail> {
    const product = await this.runtime.queries.products.byId(id);
    if (product === null) {
      throw new NotFoundException({ errorKind: 'ProductNotFound', errorParams: { id } });
    }
    return product;
  }

  @Get(':id/movements')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Ultimos movimientos de inventario, del mas reciente al mas antiguo' })
  movements(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(movementsQuerySchema)) query: z.infer<typeof movementsQuerySchema>,
  ): Promise<readonly StockMovementItem[]> {
    return this.runtime.queries.products.movements(id, query.limit);
  }

  @Post()
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Dar de alta un producto' })
  async create(
    @Body(new ZodValidationPipe(createProductSchema)) body: z.infer<typeof createProductSchema>,
  ): Promise<{ id: string; sku: string }> {
    return unwrapOrThrow(
      await this.useCases.createProduct({
        sku: body.sku || null,
        name: body.name,
        price: body.price,
        ...(body.unit ? { unit: body.unit } : {}),
        cost: body.cost || null,
        initialStock: body.initialStock || null,
        minStock: body.minStock || null,
        ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
        ...(body.trackStock !== undefined ? { trackStock: body.trackStock } : {}),
      }),
    );
  }

  /**
   * Corregir la ficha.
   *
   * NO toca el inventario, y el esquema es lo primero que lo garantiza: no acepta ni
   * `initialStock` ni `trackStock` ni el saldo. El saldo se mueve por `:id/stock`, que
   * exige un motivo, y ese es el unico camino.
   *
   * Tampoco acepta `sku`. Con `.strict()`, mandarlo da un 400 en lugar de ignorarse.
   */
  @Patch(':id')
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Corregir la ficha de un producto' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductBodySchema))
    body: z.infer<typeof updateProductBodySchema>,
  ): Promise<{ id: string; sku: string }> {
    return unwrapOrThrow(
      await this.useCases.updateProduct({
        productId: id,
        name: body.name,
        price: body.price,
        unit: body.unit || null,
        cost: body.cost || null,
        minStock: body.minStock || null,
        description: body.description || null,
        ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
      }),
    );
  }

  @Patch(':id/status')
  @RequirePermission('product:write')
  @ApiOperation({ summary: 'Sacar del catalogo, o devolverlo' })
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ): Promise<{ archived: boolean }> {
    return unwrapOrThrow(
      await this.useCases.setProductStatus({ productId: id, archived: body.archived }),
    );
  }

  /**
   * Ajustar el inventario.
   *
   * Es un POST sobre una subcoleccion y no un PATCH del producto porque cada ajuste es
   * un HECHO que se guarda: queda un movimiento con su motivo y su autor. Un PATCH
   * sugeriria que el saldo es un campo que se sobrescribe y que lo anterior se pierde,
   * y aqui es justo al reves.
   */
  @Post(':id/stock-adjustments')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Fijar el saldo de inventario, dejando rastro del motivo' })
  async adjustStock(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adjustStockSchema)) body: z.infer<typeof adjustStockSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.adjustStock({
        productId: id,
        newBalance: body.newBalance,
        reason: body.reason,
      }),
    );
  }
}
