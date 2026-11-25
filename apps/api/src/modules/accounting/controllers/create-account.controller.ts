import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { createAccountSchema } from '@corebiz/contracts';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/accounts')
export class CreateAccountController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post()
  @RequirePermission('accounting:write')
  @ApiOperation({ summary: 'Crear una nueva cuenta contable o subcuenta' })
  async run(
    @Body(new ZodValidationPipe(createAccountSchema))
    body: z.infer<typeof createAccountSchema>,
  ): Promise<{ accountId: string; code: string }> {
    const result = await this.useCases.createAccount.execute({
      id: crypto.randomUUID(),
      tenantId: this.ctx.tenantId,
      code: body.code,
      name: body.name,
      category: body.category,
      parentId: body.parentId,
      isReconcilable: body.isReconcilable,
      fiscalCountry: this.ctx.settings.fiscalCountry ?? 'VE',
    });

    return unwrapOrThrow(result);
  }
}
