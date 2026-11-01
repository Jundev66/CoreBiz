import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { updateCustomerBodySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/customers')
export class UpdateCustomerController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Patch(':id')
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Corregir la ficha de un cliente' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerBodySchema))
    body: z.infer<typeof updateCustomerBodySchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.updateCustomer({
        customerId: id,
        name: body.name,
        taxId: body.taxId || null,
        email: body.email || null,
        phone: body.phone || null,
        creditLimit: body.creditLimit || null,
        addressLine1: body.addressLine1 || null,
        addressCity: body.addressCity || null,
        addressState: body.addressState || null,
      }),
    );
  }
}
