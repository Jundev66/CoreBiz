import { describe, it, expect, beforeEach } from 'vitest';
import {
  Money,
  Plan,
  Product,
  Quantity,
  Supplier,
  asId,
  unwrap,
  type ProductId,
  type SupplierId,
  type TenantId,
} from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  InMemoryAuditLogger,
  createSalesStores,
  makeTestContext,
  type SalesStores,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeConfirmVisionReceipt } from './confirm-vision-receipt';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-10-28T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('confirmVisionReceipt', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;
  let supplier: Supplier;
  let product: Product;

  beforeEach(() => {
    stores = createSalesStores();
    audit = new InMemoryAuditLogger(TENANT);

    supplier = unwrap(
      Supplier.create({
        id: asId<SupplierId>('sup-1'),
        tenantId: TENANT,
        code: 'PRV26000001',
        name: 'Distribuidora Central, C.A.',
        createdAt: NOW,
      }),
    );
    stores.suppliers.set(supplier.id, supplier);

    product = unwrap(
      Product.create({
        id: asId<ProductId>('prd-1'),
        tenantId: TENANT,
        sku: 'HRN-001',
        name: 'Harina de trigo 1 kg',
        price: usd('1.50'),
        cost: usd('1.20'),
        initialStock: qty('10'),
        trackStock: true,
        createdAt: NOW,
      }),
    );
    product.pullStockMovements();
    stores.products.set(product.id, product);
  });

  const useCase = (ctx = makeTestContext({ plan: Plan.of('pro') })) =>
    makeConfirmVisionReceipt({
      uow: new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit),
      ctx,
      clock: fixedClock(NOW),
      ids: sequentialIdGenerator('test'),
    });

  it('registra una recepción con proveedor y producto existentes, incrementando inventario', async () => {
    const run = useCase();
    const result = await run({
      supplierDecision: { mode: 'existing', supplierId: supplier.id },
      linesDecision: [
        {
          mode: 'existing',
          productId: product.id,
          quantity: '5',
          unitCost: '1.25',
        },
      ],
      documentMetadata: {
        filename: 'remito_proveedor.pdf',
        documentHash: 'a1b2c3d4e5f67890',
        supplierReference: 'FAC-9901',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.number).toMatch(/^RM-\d+$/);
    expect(result.value.supplierName).toBe('Distribuidora Central, C.A.');
    expect(result.value.total).toBe('6.25');
    expect(result.value.createdSupplier).toBe(false);
    expect(result.value.createdProductsCount).toBe(0);

    // Verificar que el inventario del producto aumentó de 10 a 15
    const updatedProduct = stores.products.get(product.id);
    expect(updatedProduct?.onHand.toString()).toBe('15.000');

    // Verificar la auditoría con trazabilidad de origen
    const logs = audit.entries;
    const receiptAudit = logs.find((l) => l.action === 'goods_receipt.received');
    expect(receiptAudit).toBeDefined();
    expect(receiptAudit?.summary).toMatchObject({
      source: 'synapse_vision',
      filename: 'remito_proveedor.pdf',
      documentHash: 'a1b2c3d4e5f67890',
    });
  });

  it('da de alta el proveedor y nuevos productos al vuelo en la misma transacción atómica', async () => {
    const run = useCase();
    const result = await run({
      supplierDecision: {
        mode: 'create',
        name: 'Molinos del Sur, S.A.',
        taxId: 'J-98765432-1',
      },
      linesDecision: [
        {
          mode: 'existing',
          productId: product.id,
          quantity: '10',
          unitCost: '1.20',
        },
        {
          mode: 'create',
          name: 'Levadura fresca 500 g',
          sku: 'LEV-500',
          unit: 'paquete',
          quantity: '20',
          unitCost: '0.80',
        },
      ],
      documentMetadata: {
        filename: 'factura_molinos.pdf',
        documentHash: 'hash1234567890',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.createdSupplier).toBe(true);
    expect(result.value.createdProductsCount).toBe(1);
    expect(result.value.supplierName).toBe('Molinos del Sur, S.A.');
    // 10 * 1.20 + 20 * 0.80 = 12.00 + 16.00 = 28.00
    expect(result.value.total).toBe('28.00');

    // Verificar que el nuevo producto fue creado en catálogo y tiene stock 20
    const allProducts = Array.from(stores.products.values());
    const newProduct = allProducts.find((p) => p.sku === 'LEV-500');
    expect(newProduct).toBeDefined();
    expect(newProduct?.name).toBe('Levadura fresca 500 g');
    expect(newProduct?.onHand.toString()).toBe('20.000');

    // El stock del producto existente aumentó de 10 a 20
    const existingUpdated = stores.products.get(product.id);
    expect(existingUpdated?.onHand.toString()).toBe('20.000');
  });

  it('rechaza la operación si el usuario carece de permisos de recepción', async () => {
    const run = useCase(
      makeTestContext({
        actor: { userId: asId('u-viewer'), role: 'viewer' },
      }),
    );
    const result = await run({
      supplierDecision: { mode: 'existing', supplierId: supplier.id },
      linesDecision: [{ mode: 'existing', productId: product.id, quantity: '1', unitCost: '1' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('Forbidden');
  });

  it('falla si no se especifica ninguna línea', async () => {
    const run = useCase();
    const result = await run({
      supplierDecision: { mode: 'existing', supplierId: supplier.id },
      linesDecision: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('NoLines');
  });
});
