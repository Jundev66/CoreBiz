import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidv7 } from 'uuidv7';
import { Plan, asId, type TenantId, type UserId } from '@corebiz/domain';
import { systemClock, type TenantContext, type TenantSettings } from '@corebiz/application';
import { postgresRuntime } from '@corebiz/infrastructure';
import { databaseUrl } from '../../../config/driver';

const DEMO_TENANT_ID = asId<TenantId>('00000000-0000-4000-8000-000000000001');
const DEMO_USER_ID = asId<UserId>('00000000-0000-4000-8000-000000000001');

const DEMO_SETTINGS: TenantSettings = {
  taxLabel: 'IVA',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  exchangeRateScaled: null,
  exchangeRateAt: null,
};

const FALLBACK_DEMO_CUSTOMERS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'CLI-0001',
    name: 'Consumidor Final',
    taxId: 'V-00000000',
    email: null,
    phone: null,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'CLI-0002',
    name: 'Inversiones Los Andes C.A.',
    taxId: 'J-12345678-9',
    email: 'contacto@losandes.com',
    phone: '0414-1234567',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    code: 'CLI-0003',
    name: 'Distribuidora El Sol S.R.L.',
    taxId: 'J-98765432-1',
    email: 'ventas@elsol.com',
    phone: '0424-9876543',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    code: 'CLI-0004',
    name: 'Juan Carlos Rodríguez',
    taxId: 'V-15678901',
    email: null,
    phone: '0412-5551234',
  },
];

@ApiTags('POS')
@Controller('v1/pos/demo-customers')
export class GetDemoPosCustomersController {
  @Get()
  @ApiOperation({
    summary: 'Get demo customers for offline POS seeder',
  })
  async getDemoCustomers() {
    try {
      const ctx: TenantContext = {
        tenantId: DEMO_TENANT_ID,
        tenantSlug: 'demo',
        actor: { userId: DEMO_USER_ID, role: 'owner' },
        plan: Plan.of('free'),
        settings: DEMO_SETTINGS,
        isDemo: true,
      };

      const { queries } = postgresRuntime({
        url: databaseUrl(),
        ctx,
        ids: { next: () => uuidv7() },
        clock: systemClock,
        trace: { actorEmail: 'demo@corebiz.app', ipHash: null, userAgent: 'POS Demo Seeder' },
      });

      const page = await queries.customers.list({ limit: 100 });

      if (!page.items || page.items.length === 0) {
        return {
          items: FALLBACK_DEMO_CUSTOMERS,
          serverTime: new Date().toISOString(),
        };
      }

      return {
        items: page.items.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          taxId: c.taxId ?? 'V-00000000',
          email: null,
          phone: null,
        })),
        serverTime: new Date().toISOString(),
      };
    } catch {
      return {
        items: FALLBACK_DEMO_CUSTOMERS,
        serverTime: new Date().toISOString(),
      };
    }
  }
}
