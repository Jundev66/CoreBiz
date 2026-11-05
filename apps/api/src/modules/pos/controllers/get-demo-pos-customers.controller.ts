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
    id: '10000000-0000-4000-8000-000000000000',
    code: 'CF-0000',
    name: 'Consumidor Final',
    taxId: 'V-00000000',
    email: null,
    phone: null,
  },
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'CLT26000001',
    name: 'Bodega La Esquina',
    taxId: 'J-30456789-1',
    email: 'contacto@clt26000001.ve',
    phone: '0414-1234567',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'CLT26000002',
    name: 'Panaderia Santa Rosa',
    taxId: 'J-31122334-5',
    email: 'contacto@clt26000002.ve',
    phone: '0414-2345678',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    code: 'CLT26000003',
    name: 'Ferreteria El Tornillo',
    taxId: 'J-29887766-0',
    email: 'contacto@clt26000003.ve',
    phone: '0414-3456789',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    code: 'CLT26000004',
    name: 'Farmacia San Jose',
    taxId: 'J-30111222-3',
    email: 'contacto@clt26000004.ve',
    phone: '0414-4567890',
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    code: 'CLT26000005',
    name: 'Licoreria El Brindis',
    taxId: 'J-31998877-6',
    email: 'contacto@clt26000005.ve',
    phone: '0414-5678901',
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    code: 'CLT26000006',
    name: 'Charcuteria Los Andes',
    taxId: 'J-30554433-2',
    email: 'contacto@clt26000006.ve',
    phone: '0414-6789012',
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    code: 'CLT26000007',
    name: 'Supermercado Mi Barrio',
    taxId: 'J-29334455-7',
    email: 'contacto@clt26000007.ve',
    phone: '0414-7890123',
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    code: 'CLT26000008',
    name: 'Restaurante Dona Carmen',
    taxId: 'J-31667788-4',
    email: 'contacto@clt26000008.ve',
    phone: '0414-8901234',
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
