import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidv7 } from 'uuidv7';
import { Plan, asId, type TenantId, type UserId } from '@corebiz/domain';
import { systemClock, type TenantContext, type TenantSettings } from '@corebiz/application';
import { postgresRuntime } from '@corebiz/infrastructure';
import { activeDriver, databaseUrl } from '../../../config/driver';

const DEMO_TENANT_ID = asId<TenantId>('00000000-0000-4000-8000-000000000001');
const DEMO_USER_ID = asId<UserId>('00000000-0000-4000-8000-000000000001');

const DEMO_SETTINGS: TenantSettings = {
  taxLabel: 'IVA',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  exchangeRateScaled: null,
  exchangeRateAt: null,
};

const FALLBACK_DEMO_PRODUCTS = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    sku: 'HRN-001',
    name: 'Harina de trigo 1 kg',
    unit: 'und',
    price: '1.20',
    trackStock: true,
    onHand: '240',
    barcode: '7591001000011',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    sku: 'AZC-001',
    name: 'Azúcar refinada 1 kg',
    unit: 'und',
    price: '1.45',
    trackStock: true,
    onHand: '180',
    barcode: '7591001000028',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    sku: 'ARZ-001',
    name: 'Arroz blanco 1 kg',
    unit: 'und',
    price: '1.10',
    trackStock: true,
    onHand: '320',
    barcode: '7591001000035',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    sku: 'ACT-001',
    name: 'Aceite de maíz 1 L',
    unit: 'und',
    price: '2.80',
    trackStock: true,
    onHand: '95',
    barcode: '7591001000042',
  },
  {
    id: '20000000-0000-4000-8000-000000000005',
    sku: 'CAF-001',
    name: 'Café molido 250 g',
    unit: 'und',
    price: '3.50',
    trackStock: true,
    onHand: '64',
    barcode: '7591001000059',
  },
  {
    id: '20000000-0000-4000-8000-000000000006',
    sku: 'LCH-001',
    name: 'Leche en polvo 900 g',
    unit: 'und',
    price: '6.90',
    trackStock: true,
    onHand: '42',
    barcode: '7591001000066',
  },
  {
    id: '20000000-0000-4000-8000-000000000007',
    sku: 'PST-001',
    name: 'Pasta larga 1 kg',
    unit: 'und',
    price: '1.35',
    trackStock: true,
    onHand: '210',
    barcode: '7591001000073',
  },
  {
    id: '20000000-0000-4000-8000-000000000008',
    sku: 'QSO-001',
    name: 'Queso blanco',
    unit: 'kg',
    price: '5.60',
    trackStock: true,
    onHand: '18.5',
    barcode: '7591001000080',
  },
  {
    id: '20000000-0000-4000-8000-000000000009',
    sku: 'JMN-001',
    name: 'Jamón de pierna',
    unit: 'kg',
    price: '8.20',
    trackStock: true,
    onHand: '12.25',
    barcode: '7591001000097',
  },
  {
    id: '20000000-0000-4000-8000-000000000010',
    sku: 'REF-001',
    name: 'Refresco 2 L',
    unit: 'und',
    price: '1.75',
    trackStock: true,
    onHand: '150',
    barcode: '7591001000103',
  },
  {
    id: '20000000-0000-4000-8000-000000000011',
    sku: 'PPL-001',
    name: 'Papel higiénico x4',
    unit: 'und',
    price: '2.10',
    trackStock: true,
    onHand: '88',
    barcode: '7591001000110',
  },
  {
    id: '20000000-0000-4000-8000-000000000012',
    sku: 'DTG-001',
    name: 'Detergente 1 kg',
    unit: 'und',
    price: '2.95',
    trackStock: true,
    onHand: '70',
    barcode: '7591001000127',
  },
  {
    id: '20000000-0000-4000-8000-000000000013',
    sku: 'SRV-001',
    name: 'Despacho a domicilio',
    unit: 'und',
    price: '5.00',
    trackStock: false,
    onHand: '0',
    barcode: '7591001000134',
  },
];

@ApiTags('pos')
@Controller('v1/pos')
export class GetDemoPosCatalogController {
  @Get('demo-catalog')
  @ApiOperation({ summary: 'Obtener catalogo de productos de demostracion ERP' })
  async run() {
    if (activeDriver() === 'memory') {
      return {
        items: FALLBACK_DEMO_PRODUCTS,
        serverTime: new Date().toISOString(),
      };
    }

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

      const page = await queries.products.list({ limit: 100 });

      if (!page.items || page.items.length === 0) {
        return {
          items: FALLBACK_DEMO_PRODUCTS,
          serverTime: new Date().toISOString(),
        };
      }

      return {
        items: page.items.map((p) => {
          const fallback = FALLBACK_DEMO_PRODUCTS.find((f) => f.sku === p.sku);
          return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            unit: p.unit,
            price: p.price,
            trackStock: p.trackStock,
            onHand: p.onHand ?? '0',
            barcode: fallback?.barcode ?? null,
          };
        }),
        serverTime: new Date().toISOString(),
      };
    } catch {
      return {
        items: FALLBACK_DEMO_PRODUCTS,
        serverTime: new Date().toISOString(),
      };
    }
  }
}
