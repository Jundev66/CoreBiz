import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { receivePaymentSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('cobros')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/payments')
export class ReceiveCustomerPaymentController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post()
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Registrar un cobro a una o varias notas de entrega' })
  async run(
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
}
