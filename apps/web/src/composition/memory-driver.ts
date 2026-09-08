import 'server-only';
import {
  Customer,
  DeliveryNote,
  ExchangeRate,
  Money,
  Product,
  Quantity,
  Supplier,
  asId,
  type CustomerId,
  type DeliveryNoteId,
  type ProductId,
  type SupplierId,
  type Currency,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  createSalesStores,
  inMemoryReadModels,
  type ReadModels,
  type SalesStores,
} from '@corebiz/application';

/**
 * Almacen en memoria para `pnpm dev:nodb`.
 *
 * Vive en `globalThis` a proposito: la recarga en caliente de Next recrea los modulos
 * en cada cambio, y sin esto los datos que acabas de introducir desaparecerian al
 * guardar un archivo. Es una molestia clasica del desarrollo con estado en memoria.
 */

export const MEMORY_TENANT = asId<TenantId>('00000000-0000-0000-0000-0000000000t1');
const DEMO_USER = asId<UserId>('00000000-0000-0000-0000-000000000001');

const SEEDED_AT = new Date('2026-01-15T10:00:00.000Z');
const RATE = ExchangeRate.fromScaled(
  3_650_000_000n,
  'USD',
  'VES',
  new Date('2026-09-01T00:00:00.000Z'),
);

interface MemoryStore extends SalesStores {
  seeded: boolean;
}

const globalForMemory = globalThis as unknown as { __corebizMemory?: MemoryStore };

function store(): MemoryStore {
  globalForMemory.__corebizMemory ??= { ...createSalesStores(), seeded: false };
  const current = globalForMemory.__corebizMemory;
  if (!current.seeded) {
    seed(current);
    current.seeded = true;
  }
  return current;
}

const pad = (n: number) => n.toString().padStart(3, '0');

/** Datos con aspecto de comercio real, no "Cliente 1, Cliente 2". */
const CUSTOMERS: readonly (readonly [string, string, string, string | null])[] = [
  ['CLT26000001', 'Bodega La Esquina', 'J-30456789-1', '1500.00'],
  ['CLT26000002', 'Panaderia Santa Rosa', 'J-31122334-5', '800.00'],
  ['CLT26000003', 'Ferreteria El Tornillo', 'J-29887766-0', '3000.00'],
  ['CLT26000004', 'Farmacia San Jose', 'J-30111222-3', null],
  ['CLT26000005', 'Licoreria El Brindis', 'J-31998877-6', '2200.00'],
  ['CLT26000006', 'Charcuteria Los Andes', 'J-30554433-2', '950.00'],
  ['CLT26000007', 'Supermercado Mi Barrio', 'J-29334455-7', '5000.00'],
  ['CLT26000008', 'Restaurante Dona Carmen', 'J-31667788-4', '1200.00'],
];

/** [codigo, nombre, RIF, contacto, telefono] — los mismos que `supabase/seed.sql`. */
const SUPPLIERS: readonly (readonly [string, string, string, string, string])[] = [
  ['PRV26000001', 'Distribuidora Central, C.A.', 'J-30778899-1', 'Luis Marcano', '0212-5551020'],
  ['PRV26000002', 'Alimentos del Valle', 'J-31445566-8', 'Rosa Bermudez', '0414-3339977'],
  ['PRV26000003', 'Importadora La Guaira', 'J-29556677-4', 'Pedro Alcala', '0424-8812345'],
];

/** [sku, nombre, unidad, precio, stock, minimo] */
const PRODUCTS: readonly (readonly [string, string, string, string, string, string | null])[] = [
  ['HRN-001', 'Harina de trigo 1 kg', 'und', '1.20', '240', '50'],
  ['AZC-001', 'Azucar refinada 1 kg', 'und', '1.45', '180', '40'],
  ['ARZ-001', 'Arroz blanco 1 kg', 'und', '1.10', '320', '60'],
  ['ACT-001', 'Aceite de maiz 1 L', 'und', '2.80', '95', '30'],
  ['CAF-001', 'Cafe molido 250 g', 'und', '3.50', '64', '20'],
  ['LCH-001', 'Leche en polvo 900 g', 'und', '6.90', '42', '15'],
  ['PST-001', 'Pasta larga 1 kg', 'und', '1.35', '210', '50'],
  ['QSO-001', 'Queso blanco', 'kg', '5.60', '18.500', '10'],
  ['JMN-001', 'Jamon de pierna', 'kg', '8.20', '12.250', '8'],
  ['REF-001', 'Refresco 2 L', 'und', '1.75', '150', '40'],
  ['PPL-001', 'Papel higienico x4', 'und', '2.10', '88', '25'],
  ['DTG-001', 'Detergente 1 kg', 'und', '2.95', '70', '20'],
  ['SRV-001', 'Despacho a domicilio', 'und', '5.00', '0', null],
];

/** Notas ya emitidas, para que el modulo de ventas no aparezca vacio. */
const NOTES: readonly (readonly [string, string, readonly (readonly [string, string])[]])[] = [
  [
    'NE-000001',
    'CLT26000001',
    [
      ['HRN-001', '20'],
      ['AZC-001', '15'],
      ['ARZ-001', '30'],
    ],
  ],
  [
    'NE-000002',
    'CLT26000003',
    [
      ['DTG-001', '12'],
      ['PPL-001', '10'],
    ],
  ],
  [
    'NE-000003',
    'CLT26000007',
    [
      ['REF-001', '48'],
      ['PST-001', '25'],
      ['ACT-001', '10'],
    ],
  ],
  [
    'NE-000004',
    'CLT26000002',
    [
      ['HRN-001', '40'],
      ['LCH-001', '8'],
    ],
  ],
  [
    'NE-000005',
    'CLT26000008',
    [
      ['QSO-001', '3.500'],
      ['JMN-001', '2.250'],
    ],
  ],
];

function seed(target: MemoryStore): void {
  const customersByCode = new Map<string, Customer>();
  const productsBySku = new Map<string, Product>();

  CUSTOMERS.forEach(([code, name, taxId, creditLimit], index) => {
    const limit = creditLimit ? Money.of(creditLimit, 'USD') : null;
    const created = Customer.create({
      id: asId<CustomerId>(`00000000-0000-0000-0000-0000000c${pad(index + 1)}`),
      tenantId: MEMORY_TENANT,
      code,
      name,
      taxId,
      email: `contacto@${code.toLowerCase()}.ve`,
      creditLimit: limit?.ok ? limit.value : null,
      createdAt: SEEDED_AT,
    });
    if (created.ok) {
      created.value.pullDomainEvents();
      target.customers.set(created.value.id, created.value);
      customersByCode.set(code, created.value);
    }
  });

  PRODUCTS.forEach(([sku, name, unit, price, stock, minStock], index) => {
    const parsedPrice = Money.of(price, 'USD');
    const parsedStock = Quantity.of(stock);
    if (!parsedPrice.ok || !parsedStock.ok) return;

    const min = minStock ? Quantity.of(minStock) : null;
    const created = Product.create({
      id: asId<ProductId>(`00000000-0000-0000-0000-0000000p${pad(index + 1)}`),
      tenantId: MEMORY_TENANT,
      sku,
      name,
      unit,
      price: parsedPrice.value,
      initialStock: parsedStock.value,
      minStock: min?.ok ? min.value : null,
      // El servicio de despacho no lleva inventario: es lo que ejercita esa rama.
      trackStock: sku !== 'SRV-001',
      createdAt: SEEDED_AT,
    });
    if (created.ok) {
      created.value.pullDomainEvents();
      created.value.pullStockMovements();
      target.products.set(created.value.id, created.value);
      productsBySku.set(sku, created.value);
    }
  });

  NOTES.forEach(([number, customerCode, lines], index) => {
    const customer = customersByCode.get(customerCode);
    if (!customer) return;

    const built = lines.flatMap(([sku, quantity]) => {
      const product = productsBySku.get(sku);
      const parsed = Quantity.of(quantity);
      return product && parsed.ok ? [{ product, quantity: parsed.value }] : [];
    });

    // Fechas escalonadas hacia atras, para que el listado parezca un historial y no
    // una carga masiva hecha toda en el mismo instante.
    const issuedAt = new Date(SEEDED_AT.getTime() + index * 86_400_000 * 3);

    const created = DeliveryNote.issue({
      id: asId<DeliveryNoteId>(`00000000-0000-0000-0000-0000000n${pad(index + 1)}`),
      tenantId: MEMORY_TENANT,
      number,
      customerId: customer.id,
      lines: built,
      exchangeRate: RATE,
      currency: 'USD',
      taxLabel: 'Impuesto informativo',
      taxRateBp: 1600,
      issuedAt,
      issuedBy: DEMO_USER,
    });
    if (created.ok) {
      created.value.pullDomainEvents();
      target.deliveryNotes.set(created.value.id, created.value);
    }
  });

  // Los movimientos de la siembra ya estan reflejados en el saldo.
  for (const product of target.products.values()) product.pullStockMovements();

  // Los proveedores, los mismos que `seed.sql`. Sin ellos el modulo de compras se
  // abre vacio y no se puede registrar una entrada: el desplegable no tiene a quien
  // elegir, y un modulo que existe y no se puede usar se lee como un modulo roto.
  SUPPLIERS.forEach(([code, name, taxId, contact, phone], index) => {
    const created = Supplier.create({
      id: asId<SupplierId>(`00000000-0000-0000-0000-0000000s${pad(index + 1)}`),
      tenantId: MEMORY_TENANT,
      code,
      name,
      taxId,
      contactName: contact,
      phone,
      email: null,
      notes: null,
      createdAt: SEEDED_AT,
    });
    if (created.ok) {
      created.value.pullDomainEvents();
      target.suppliers.set(created.value.id, created.value);
    }
  });

  // El equipo: una sola persona, la duena. Es lo mismo que siembra `seed.sql`, y
  // deja el plan gratuito con una plaza libre — justo la que hace falta para que
  // se pueda probar invitar a alguien y chocar despues con el limite.
  target.members.set(`${MEMORY_TENANT}:${DEMO_USER}`, {
    tenantId: MEMORY_TENANT,
    userId: DEMO_USER,
    email: 'demo@corebiz.local',
    role: 'owner',
    status: 'active',
    joinedAt: SEEDED_AT,
  });

  target.usage.set(`${MEMORY_TENANT}:customers`, target.customers.size);
  target.usage.set(`${MEMORY_TENANT}:products`, target.products.size);
  target.usage.set(`${MEMORY_TENANT}:suppliers`, target.suppliers.size);
  target.usage.set(`${MEMORY_TENANT}:documents_month`, target.deliveryNotes.size);
  target.usage.set(`${MEMORY_TENANT}:users`, target.members.size);
  // La clave lleva el PERIODO al final, vacio para los documentos. Se le olvido el
  // sufijo la primera vez y el contador sembrado dejo de contar: las notas nuevas
  // volvian a empezar en NE-000001 y chocaban con las de la semilla. Lo encontro un
  // escenario BDD, no una revision.
  target.sequences.set(`${MEMORY_TENANT}:delivery_note:`, NOTES.length);

  // Los correlativos de los registros maestros, con el ano como periodo. Apuntan al
  // siguiente libre: sin esto, el primer alta chocaria contra un codigo ya usado.
  const year = String(SEEDED_AT.getFullYear()).slice(-2);
  target.sequences.set(`${MEMORY_TENANT}:customer:${year}`, target.customers.size);
  target.sequences.set(`${MEMORY_TENANT}:supplier:${year}`, target.suppliers.size);
}

export function getMemoryUnitOfWork(tenantId: TenantId): InMemoryUnitOfWork {
  const current = store();
  return new InMemoryUnitOfWork(current, current.usage, tenantId);
}

/**
 * Lado de LECTURA (CQRS ligero).
 *
 * Devuelve los mismos modelos planos que la version sobre Postgres. Que las dos
 * implementaciones cumplan un contrato explicito es lo que permite que las
 * pantallas no sepan cual esta detras.
 */
export function memoryReadModels(
  tenantId: TenantId,
  currency: Currency,
  viewerId = '',
): ReadModels {
  return inMemoryReadModels(store(), tenantId, currency, viewerId);
}
