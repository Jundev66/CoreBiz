import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { voidPaymentSchema } from '@corebiz/contracts';
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
export class VoidCustomerPaymentController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment:void')
  @ApiOperation({ summary: 'Anular un recibo de cobro revirtiendo los saldos' })
  async run(
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
