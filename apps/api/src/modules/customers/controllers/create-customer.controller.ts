import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { createCustomerSchema } from '@corebiz/contracts';
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
export class CreateCustomerController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post()
  @RequirePermission('customer:write')
  @ApiOperation({ summary: 'Dar de alta un cliente' })
  async run(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: z.infer<typeof createCustomerSchema>,
  ): Promise<{ id: string; code: string }> {
    return unwrapOrThrow(
      await this.useCases.createCustomer({
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
