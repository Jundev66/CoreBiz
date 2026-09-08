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
import { type z } from 'zod';
import { createCustomerSchema, setStatusSchema } from '@corebiz/contracts';
import type { CustomerDetail, CustomerListItem, CustomerOption, Page } from '@corebiz/application';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import {
  customerListQuerySchema,
  optionsQuerySchema,
  withoutUndefined,
} from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

/**
 * Clientes.
 *
 * El controller es un ADAPTADOR: traduce entre HTTP y el caso de uso, y nada mas. No
 * decide reglas de negocio, no consulta cuotas y no comprueba permisos por su cuenta —
 * todo eso vive en el caso de uso, que es lo unico que garantiza que la regla se
 * aplique venga la peticion de donde venga.
 */
@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/customers')
export class CustomersController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
  ) {}

  @Get()
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Listado paginado por keyset' })
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: z.infer<typeof customerListQuerySchema>,
  ): Promise<Page<CustomerListItem>> {
    return this.runtime.queries.customers.list(withoutUndefined(query));
  }

  /**
   * Declarado ANTES que `:id` a proposito. Express resuelve por orden, asi que con
   * `:id` delante una peticion a `/options` entraria por la ficha buscando un cliente
   * llamado "options" y respondiendo 404.
   */
  @Get('options')
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Lo justo para un desplegable' })
  options(
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.infer<typeof optionsQuerySchema>,
  ): Promise<readonly CustomerOption[]> {
    return this.runtime.queries.customers.options(query.limit);
  }

  @Get(':id')
  @RequirePermission('customer:read')
  @ApiOperation({ summary: 'Ficha completa' })
  async byId(@Param('id') id: string): Promise<CustomerDetail> {
    const customer = await this.runtime.queries.customers.byId(id);

    /*
     * 404 tanto si no existe como si es de otra empresa, y desde fuera no hay forma de
     * distinguirlo. Un 403 aqui confirmaria que ese identificador existe en alguna
     * parte, que es exactamente lo que busca quien prueba identificadores a mano.
     */
    if (customer === null) {
      throw new NotFoundException({ errorKind: 'CustomerNotFound', errorParams: { id } });
    }
    return customer;
  }

  @Post()
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Dar de alta un cliente' })
  async create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: z.infer<typeof createCustomerSchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.createCustomer({
        name: body.name,
        // La cadena vacia que manda un formulario no es un valor: es la ausencia de
        // uno. El dominio distingue null de "" y aqui es donde se traduce.
        taxId: body.taxId || null,
        email: body.email || null,
        phone: body.phone || null,
        creditLimit: body.creditLimit || null,
      }),
    );
  }

  @Patch(':id/status')
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Archivar un cliente, o devolverlo a la lista' })
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ): Promise<{ archived: boolean }> {
    return unwrapOrThrow(
      await this.useCases.setCustomerStatus({ customerId: id, archived: body.archived }),
    );
  }
}
