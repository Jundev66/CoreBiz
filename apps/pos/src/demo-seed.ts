import { posDb, type LocalProduct, type LocalCustomer } from './db';

export const DEMO_REGISTER_CODE = 'CAJA-01';
export const DEMO_REGISTER_ID = '00000000-0000-0000-0000-000000000099';
export const DEMO_DEVICE_ID = '018e245a-0000-7000-8000-000000000001';
export const DEMO_DEVICE_TOKEN = 'pos-demo-token-000000000001';

export const DEMO_CATALOG_PRODUCTS: readonly LocalProduct[] = [
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

export const DEMO_CUSTOMERS: readonly LocalCustomer[] = [
  {
    id: '10000000-0000-4000-8000-000000000000',
    code: 'CF-0000',
    name: 'Consumidor Final',
    taxId: 'V-00000000',
  },
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'CLT26000001',
    name: 'Bodega La Esquina',
    taxId: 'J-30456789-1',
    phone: '0414-1234567',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'CLT26000002',
    name: 'Panaderia Santa Rosa',
    taxId: 'J-31122334-5',
    phone: '0414-2345678',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    code: 'CLT26000003',
    name: 'Ferreteria El Tornillo',
    taxId: 'J-29887766-0',
    phone: '0414-3456789',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    code: 'CLT26000004',
    name: 'Farmacia San Jose',
    taxId: 'J-30111222-3',
    phone: '0414-4567890',
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    code: 'CLT26000005',
    name: 'Licoreria El Brindis',
    taxId: 'J-31998877-6',
    phone: '0414-5678901',
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    code: 'CLT26000006',
    name: 'Charcuteria Los Andes',
    taxId: 'J-30554433-2',
    phone: '0414-6789012',
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    code: 'CLT26000007',
    name: 'Supermercado Mi Barrio',
    taxId: 'J-29334455-7',
    phone: '0414-7890123',
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    code: 'CLT26000008',
    name: 'Restaurante Dona Carmen',
    taxId: 'J-31667788-4',
    phone: '0414-8901234',
  },
];

export async function seedDemoDataIfEmpty(force = false): Promise<boolean> {
  const count = await posDb.catalog.count();
  const custCount = await posDb.customers.count();

  if (custCount === 0 || force) {
    await posDb.customers.bulkPut([...DEMO_CUSTOMERS]);
  }

  if (count === 0 || force) {
    await posDb.catalog.bulkPut([...DEMO_CATALOG_PRODUCTS]);

    const regCode = await posDb.config.get('register_code');
    if (!regCode || force) {
      await posDb.config.put({ key: 'register_code', value: DEMO_REGISTER_CODE });
      await posDb.config.put({ key: 'register_id', value: DEMO_REGISTER_ID });
      await posDb.config.put({ key: 'device_id', value: DEMO_DEVICE_ID });
      await posDb.config.put({ key: 'device_token', value: DEMO_DEVICE_TOKEN });
    }
    return true;
  }

  const existingToken = await posDb.config.get('device_token');
  if (!existingToken) {
    await posDb.config.put({ key: 'device_token', value: DEMO_DEVICE_TOKEN });
  }
  const existingDeviceId = await posDb.config.get('device_id');
  if (!existingDeviceId || existingDeviceId.value === 'dev-default') {
    await posDb.config.put({ key: 'device_id', value: DEMO_DEVICE_ID });
  }
  const existingRegId = await posDb.config.get('register_id');
  if (!existingRegId || existingRegId.value === 'reg-default') {
    await posDb.config.put({ key: 'register_id', value: DEMO_REGISTER_ID });
  }
  const existingRegCode = await posDb.config.get('register_code');
  if (!existingRegCode) {
    await posDb.config.put({ key: 'register_code', value: DEMO_REGISTER_CODE });
  }

  return false;
}

export async function fetchErpDemoCatalog(apiBaseUrl = ''): Promise<number> {
  try {
    const custRes = await fetch(`${apiBaseUrl}/v1/pos/demo-customers`);
    if (custRes.ok) {
      const custData = (await custRes.json()) as {
        items: LocalCustomer[];
      };
      if (custData.items && custData.items.length > 0) {
        await posDb.customers.bulkPut(custData.items);
      }
    }
  } catch {
    const custCount = await posDb.customers.count();
    if (custCount === 0) {
      await posDb.customers.bulkPut([...DEMO_CUSTOMERS]);
    }
  }

  try {
    const res = await fetch(`${apiBaseUrl}/v1/pos/demo-catalog`);
    if (!res.ok) {
      await seedDemoDataIfEmpty(true);
      return DEMO_CATALOG_PRODUCTS.length;
    }

    const data = (await res.json()) as {
      items: Array<{
        id: string;
        sku: string;
        name: string;
        unit: string;
        price: string;
        trackStock: boolean;
        onHand: string;
        barcode?: string | null;
      }>;
    };

    if (data.items && data.items.length > 0) {
      const localProducts: LocalProduct[] = data.items.map((p) => {
        const fallbackProd = DEMO_CATALOG_PRODUCTS.find((d) => d.sku === p.sku);
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          price: p.price,
          trackStock: p.trackStock,
          onHand: p.onHand,
          barcode: p.barcode || fallbackProd?.barcode || null,
        };
      });

      await posDb.catalog.bulkPut(localProducts);

      const regCode = await posDb.config.get('register_code');
      if (!regCode) {
        await posDb.config.put({ key: 'register_code', value: DEMO_REGISTER_CODE });
        await posDb.config.put({ key: 'register_id', value: DEMO_REGISTER_ID });
        await posDb.config.put({ key: 'device_id', value: DEMO_DEVICE_ID });
      }

      return localProducts.length;
    }

    await seedDemoDataIfEmpty(true);
    return DEMO_CATALOG_PRODUCTS.length;
  } catch {
    await seedDemoDataIfEmpty(true);
    return DEMO_CATALOG_PRODUCTS.length;
  }
}
