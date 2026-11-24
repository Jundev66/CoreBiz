import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { isRole } from '@corebiz/domain';
import type { SessionMembership } from '@corebiz/infrastructure';
import { switchTenantInputSchema, type SwitchTenantResponse } from '@corebiz/contracts';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { MEMBERSHIPS } from '../../../tokens';

@ApiTags('acceso')
@ApiBearerAuth()
@Controller('v1/access')
export class SwitchTenantController {
  constructor(@Inject(MEMBERSHIPS) private readonly memberships: readonly SessionMembership[]) {}

  @Post('tenants/switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambio de empresa activa para la sesion de usuario' })
  run(
    @Body(new ZodValidationPipe(switchTenantInputSchema))
    body: z.infer<typeof switchTenantInputSchema>,
  ): SwitchTenantResponse {
    const target = this.memberships.find((m) => m.tenantId === body.targetTenantId);

    if (!target) {
      throw new ForbiddenException({
        errorKind: 'UserNotMember',
        errorParams: { tenantId: body.targetTenantId },
      });
    }

    if (target.status === 'suspended') {
      throw new ForbiddenException({
        errorKind: 'MembershipSuspended',
        errorParams: { tenantId: body.targetTenantId },
      });
    }

    const isVenezuela = target.taxLabel?.toLowerCase() === 'rif' || target.baseCurrency === 'VES';

    return {
      ok: true,
      tenantId: target.tenantId,
      tenantSlug: target.slug,
      fiscalCountry: isVenezuela ? 'VE' : 'US',
      currency: target.baseCurrency === 'VES' ? 'VES' : 'USD',
      role: isRole(target.role) ? target.role : 'viewer',
    };
  }
}
