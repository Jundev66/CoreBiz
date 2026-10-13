import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { receivePaymentSchema, voidPaymentSchema } from '@corebiz/contracts';
import type {
  CustomerReceivableItem,
  Page,
  PaymentListItem,
  PaymentView,
} from '@corebiz/application';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import { paymentListQuerySchema, withoutUndefined } from '../../http/list-queries';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class PaymentsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
  ) {}

  @Get()
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Listado de cobros y recibos' })
  list(
    @Query(new ZodValidationPipe(paymentListQuerySchema))
    query: z.infer<typeof paymentListQuerySchema>,
  ): Promise<Page<PaymentListItem>> {
    return this.runtime.queries.payments.list(withoutUndefined(query));
  }

  @Get('receivables/:customerId')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Notas con saldo pendiente por cobrar para un cliente' })
  receivables(@Param('customerId') customerId: string): Promise<readonly CustomerReceivableItem[]> {
    return this.runtime.queries.payments.customerReceivables(customerId);
  }

  @Get('balance/:customerId')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Saldo pendiente de un cliente' })
  async balance(
    @Param('customerId') customerId: string,
    @Query('currency') currency?: 'USD' | 'VES',
  ): Promise<{ balance: string }> {
    const balance = await this.runtime.queries.payments.outstandingBalanceFor(
      customerId,
      currency ?? 'USD',
    );
    return { balance };
  }

  @Get(':id')
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Detalle de un cobro con sus imputaciones' })
  async byId(@Param('id') id: string): Promise<PaymentView> {
    const payment = await this.runtime.queries.payments.byId(id);
    if (payment === null) {
      throw new NotFoundException({ errorKind: 'PaymentNotFound', errorParams: { id } });
    }
    return payment;
  }

  @Post()
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Registrar un cobro a una o varias notas de entrega' })
  async receive(
    @Body(new ZodValidationPipe(receivePaymentSchema))
    body: z.infer<typeof receivePaymentSchema>,
  ): Promise<{ id: string; number: string; amount: string; currency: string }> {
    return unwrapOrThrow(
      await this.useCases.receiveCustomerPayment({
        customerId: body.customerId,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        reference: body.reference || null,
        notes: body.notes || null,
        allocations: body.allocations.map((a) => ({
          deliveryNoteId: a.deliveryNoteId,
          amount: a.amount,
        })),
      }),
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment:void')
  @ApiOperation({ summary: 'Anular un recibo de cobro revirtiendo los saldos' })
  async void(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidPaymentSchema))
    body: z.infer<typeof voidPaymentSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.voidCustomerPayment({
        paymentId: id,
        reason: body.reason,
      }),
    );
  }
}
