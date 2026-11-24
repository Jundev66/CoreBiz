import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isRole } from '@corebiz/domain';
import type { SessionMembership } from '@corebiz/infrastructure';
import type { ListUserTenantsResponse, TenantMembershipSummary } from '@corebiz/contracts';
import { MEMBERSHIPS } from '../../../tokens';

@ApiTags('acceso')
@ApiBearerAuth()
@Controller('v1/access')
export class ListUserTenantsController {
  constructor(@Inject(MEMBERSHIPS) private readonly memberships: readonly SessionMembership[]) {}

  @Get('tenants')
  @ApiOperation({ summary: 'Listado de empresas y roles del usuario autenticado' })
  run(): ListUserTenantsResponse {
    const tenants: TenantMembershipSummary[] = this.memberships.map((m) => {
      const isVenezuela = m.taxLabel?.toLowerCase() === 'rif' || m.baseCurrency === 'VES';
      return {
        tenantId: m.tenantId,
        tenantSlug: m.slug,
        tenantName: m.name,
        fiscalCountry: isVenezuela ? 'VE' : 'US',
        currency: m.baseCurrency === 'VES' ? 'VES' : 'USD',
        role: isRole(m.role) ? m.role : 'viewer',
        status:
          m.status === 'suspended' ? 'suspended' : m.status === 'invited' ? 'invited' : 'active',
      };
    });

    return { tenants };
  }
}
