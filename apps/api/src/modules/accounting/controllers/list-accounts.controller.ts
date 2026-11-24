import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { listAccountsQuerySchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

@ApiTags('contabilidad')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/accounting/accounts')
export class ListAccountsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Get()
  @RequirePermission('accounting:read')
  @ApiOperation({ summary: 'Listar catalogo de cuentas contables' })
  async run(
    @Query(new ZodValidationPipe(listAccountsQuerySchema))
    query: z.infer<typeof listAccountsQuerySchema>,
  ) {
    const result = await this.useCases.listAccounts.execute({
      tenantId: this.ctx.tenantId,
      fiscalCountry: query.fiscalCountry,
    });

    const accounts = unwrapOrThrow(result);
    return {
      accounts: accounts.map((acc) => ({
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalSide: acc.normalSide,
        isReconcilable: acc.isReconcilable,
        isActive: acc.isActive,
      })),
    };
  }
}
