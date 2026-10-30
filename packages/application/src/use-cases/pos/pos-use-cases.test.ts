import { describe, it, expect, beforeEach } from 'vitest';
import {
  asId,
  Money,
  Quantity,
  Product,
  Plan,
  PosRegister,
  PosDevice,
  type CashShift,
  type PosSale,
  InventoryConflict,
  type TenantId,
  type UserId,
  type PosRegisterId,
  type PosDeviceId,
  type ProductId,
  type PosShiftId,
  type PosSaleId,
  type InventoryConflictId,
} from '@corebiz/domain';
import type { TenantContext, Repositories, UnitOfWork, AuditEntry } from '../../ports/repositories';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import type { PosSyncOperation } from '../../ports/pos';
import { makeOpenCashShift } from './open-cash-shift';
import { makeRecordCashMovement } from './record-cash-movement';
import { makeCloseCashShift } from './close-cash-shift';
import { makeProcessPosSale, type ProcessPosSaleOutput } from './process-pos-sale';
import { makeResolveInventoryConflict } from './resolve-inventory-conflict';
import { PosCommandBus } from './command-bus';
import { OpenCashShiftCommandHandler } from './handlers/open-cash-shift.handler';
import { ProcessPosSaleCommandHandler } from './handlers/process-pos-sale.handler';

describe('POS Application Use Cases & Command Bus', () => {
  const fixedNow = new Date('2026-10-30T10:00:00Z');
  const clock = fixedClock(fixedNow);
  let idGen: ReturnType<typeof sequentialIdGenerator>;

  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const userId = asId<UserId>('018e245a-0000-7000-8000-000000000002');
  const registerId = asId<PosRegisterId>('018e245a-0000-7000-8000-000000000010');
  const deviceId = asId<PosDeviceId>('018e245a-0000-7000-8000-000000000020');
  const productId = asId<ProductId>('018e245a-0000-7000-8000-000000000030');

  const ctx: TenantContext = {
    tenantId,
    tenantSlug: 'demo-tenant',
    actor: { userId, role: 'owner' },
    plan: Plan.of('pro'),
    settings: {
      taxLabel: 'IVA',
      taxRateBp: 1600,
      baseCurrency: 'USD',
      exchangeRateScaled: null,
      exchangeRateAt: null,
    },
    isDemo: false,
  };

  let fakeRegisters: Map<string, PosRegister>;
  let fakeDevices: Map<string, PosDevice>;
  let fakeShifts: Map<string, CashShift>;
  let fakeSales: Map<string, PosSale>;
  let fakeConflicts: Map<string, InventoryConflict>;
  let fakeSyncOps: Map<string, PosSyncOperation>;
  let fakeProducts: Map<string, Product>;
  let recordedAudits: AuditEntry[];

  let repos: Repositories;
  let uow: UnitOfWork;

  beforeEach(() => {
    idGen = sequentialIdGenerator('pos-id-');
    fakeRegisters = new Map();
    fakeDevices = new Map();
    fakeShifts = new Map();
    fakeSales = new Map();
    fakeConflicts = new Map();
    fakeSyncOps = new Map();
    fakeProducts = new Map();
    recordedAudits = [];

    const regRes = PosRegister.create({
      id: registerId,
      tenantId,
      name: 'Caja 1',
      code: 'POS-01',
      now: fixedNow,
    });
    if (!regRes.ok) throw new Error('Register setup failed');
    const reg = regRes.value;
    fakeRegisters.set(reg.id, reg);

    const devRes = PosDevice.create({
      id: deviceId,
      tenantId,
      installationId: '018e245a-1111-7000-8000-000000000000',
      name: 'Tablet 1',
      now: fixedNow,
    });
    if (!devRes.ok) throw new Error('Device setup failed');
    const dev = devRes.value;
    dev.authorize('token-hash', fixedNow);
    fakeDevices.set(dev.id, dev);

    const prodRes = Product.create({
      id: productId,
      tenantId,
      sku: 'HAR-001',
      name: 'Harina de Trigo 1kg',
      unit: 'kg',
      price: Money.fromMinor(250n, 'USD'),
      stockPolicy: 'allow_negative',
      createdAt: fixedNow,
    });
    if (!prodRes.ok) throw new Error('Product setup failed');
    const prod = prodRes.value;

    const qtyRes = Quantity.of('50');
    if (!qtyRes.ok) throw new Error('Quantity setup failed');
    prod.addStock(qtyRes.value, fixedNow, {
      type: 'init',
      id: 'init-1',
    });
    fakeProducts.set(prod.id, prod);

    repos = {
      posRegisters: {
        findById: (id: PosRegisterId) => Promise.resolve(fakeRegisters.get(id) ?? null),
        findByCode: (code: string) =>
          Promise.resolve(Array.from(fakeRegisters.values()).find((r) => r.code === code) ?? null),
        list: () => Promise.resolve(Array.from(fakeRegisters.values())),
        save: (register: PosRegister) => {
          fakeRegisters.set(register.id, register);
          return Promise.resolve();
        },
      },
      posDevices: {
        findById: (id: PosDeviceId) => Promise.resolve(fakeDevices.get(id) ?? null),
        findByInstallationId: (iid: string) =>
          Promise.resolve(
            Array.from(fakeDevices.values()).find((d) => d.installationId === iid) ?? null,
          ),
        save: (device: PosDevice) => {
          fakeDevices.set(device.id, device);
          return Promise.resolve();
        },
      },
      cashShifts: {
        findById: (id: PosShiftId) => Promise.resolve(fakeShifts.get(id) ?? null),
        findActiveByRegisterId: (regId: PosRegisterId) =>
          Promise.resolve(
            Array.from(fakeShifts.values()).find(
              (s) => s.registerId === regId && s.status === 'open',
            ) ?? null,
          ),
        save: (shift: CashShift) => {
          fakeShifts.set(shift.id, shift);
          return Promise.resolve();
        },
      },
      posSales: {
        findById: (id: PosSaleId) => Promise.resolve(fakeSales.get(id) ?? null),
        findByOperationId: (opId: string) =>
          Promise.resolve(
            Array.from(fakeSales.values()).find((s) => s.operationId === opId) ?? null,
          ),
        save: (sale: PosSale) => {
          fakeSales.set(sale.id, sale);
          return Promise.resolve();
        },
      },
      inventoryConflicts: {
        findById: (id: InventoryConflictId) => Promise.resolve(fakeConflicts.get(id) ?? null),
        findOpenByProductId: (pId: string) =>
          Promise.resolve(
            Array.from(fakeConflicts.values()).find(
              (c) => c.productId === pId && c.status === 'open',
            ) ?? null,
          ),
        list: () => Promise.resolve(Array.from(fakeConflicts.values())),
        save: (conflict: InventoryConflict) => {
          fakeConflicts.set(conflict.id, conflict);
          return Promise.resolve();
        },
      },
      posSyncOperations: {
        findByOperationId: (opId: string) => Promise.resolve(fakeSyncOps.get(opId) ?? null),
        save: (op: PosSyncOperation) => {
          fakeSyncOps.set(op.operationId, op);
          return Promise.resolve();
        },
      },
      products: {
        findById: (id: ProductId) => Promise.resolve(fakeProducts.get(id) ?? null),
        findBySku: (sku: string) =>
          Promise.resolve(Array.from(fakeProducts.values()).find((p) => p.sku === sku) ?? null),
        findManyByIds: (ids: readonly ProductId[]) =>
          Promise.resolve(
            ids.map((id) => fakeProducts.get(id)!).filter((p): p is Product => Boolean(p)),
          ),
        list: () =>
          Promise.resolve({
            items: Array.from(fakeProducts.values()),
            total: fakeProducts.size,
            nextCursor: null,
          }),
        save: (p: Product) => {
          fakeProducts.set(p.id, p);
          return Promise.resolve();
        },
        saveMany: (prods: readonly Product[]) => {
          for (const p of prods) fakeProducts.set(p.id, p);
          return Promise.resolve();
        },
      },
      audit: {
        record: (entry: AuditEntry) => {
          recordedAudits.push(entry);
          return Promise.resolve();
        },
      },
    } as unknown as Repositories;

    uow = {
      run: <T>(fn: (r: Repositories) => Promise<T>): Promise<T> => fn(repos),
    };
  });

  it('opens and closes cash shift with blind reconciliation', async () => {
    const openUseCase = makeOpenCashShift({ uow, ctx, clock, ids: idGen });
    const closeUseCase = makeCloseCashShift({ uow, ctx, clock });

    const openResult = await openUseCase({
      registerId,
      deviceId,
      initialFloatMinor: '10000',
      currency: 'USD',
    });

    expect(openResult.ok).toBe(true);
    if (!openResult.ok) return;

    const shiftId = openResult.value.shiftId;
    const shift = fakeShifts.get(shiftId)!;
    expect(shift.status).toBe('open');

    const moveUseCase = makeRecordCashMovement({ uow, ctx, clock, ids: idGen });
    await moveUseCase({
      shiftId,
      type: 'cash_in',
      amountMinor: '2000',
      currency: 'USD',
      reason: 'Cambio extra',
    });

    const closeResult = await closeUseCase({
      shiftId,
      declaredCashMinor: '11800',
      notes: 'Faltante de 2 dolares',
    });

    expect(closeResult.ok).toBe(true);
    if (!closeResult.ok) return;

    expect(closeResult.value.systemCashMinor).toBe('12000');
    expect(closeResult.value.declaredCashMinor).toBe('11800');
    expect(closeResult.value.cashVarianceMinor).toBe('-200');
    expect(recordedAudits.length).toBeGreaterThan(0);
  });

  it('processes POS sale and detects negative stock conflict when stock is exceeded', async () => {
    const openUseCase = makeOpenCashShift({ uow, ctx, clock, ids: idGen });
    const openResult = await openUseCase({
      registerId,
      deviceId,
      initialFloatMinor: '5000',
      currency: 'USD',
    });
    if (!openResult.ok) throw new Error('Open failed');

    const shiftId = openResult.value.shiftId;
    const processSale = makeProcessPosSale({ uow, ctx, clock, ids: idGen });

    const saleResult = await processSale({
      operationId: 'op-sale-80-harina',
      sequence: 1,
      payloadHash: 'hash-abc',
      registerId,
      deviceId,
      shiftId,
      ticketNumber: 'POS-01-000001',
      paymentMethod: 'cash',
      lines: [
        {
          id: 'l1',
          productId,
          quantity: '80',
          unitPriceMinor: '250',
        },
      ],
      occurredAt: fixedNow.toISOString(),
    });

    expect(saleResult.ok).toBe(true);
    if (!saleResult.ok) return;

    expect(saleResult.value.status).toBe('processed');
    expect(saleResult.value.conflictId).toBeDefined();

    const product = fakeProducts.get(productId)!;
    expect(product.onHand.scaledValue).toBe(-30_000n);

    const conflict = fakeConflicts.get(saleResult.value.conflictId!)!;
    expect(conflict.conflictType).toBe('negative_stock');
    expect(conflict.shortageQuantity).toBe(30_000n);
  });

  it('prevents duplicate processing on identical operationId replay', async () => {
    const openUseCase = makeOpenCashShift({ uow, ctx, clock, ids: idGen });
    const openResult = await openUseCase({
      registerId,
      deviceId,
      initialFloatMinor: '5000',
      currency: 'USD',
    });
    if (!openResult.ok) throw new Error('Open failed');

    const shiftId = openResult.value.shiftId;
    const processSale = makeProcessPosSale({ uow, ctx, clock, ids: idGen });

    await processSale({
      operationId: 'op-replay',
      sequence: 1,
      payloadHash: 'hash-xyz',
      registerId,
      deviceId,
      shiftId,
      ticketNumber: 'POS-01-000002',
      paymentMethod: 'card',
      lines: [
        {
          id: 'l1',
          productId,
          quantity: '5',
          unitPriceMinor: '250',
        },
      ],
      occurredAt: fixedNow.toISOString(),
    });

    const replayResult = await processSale({
      operationId: 'op-replay',
      sequence: 1,
      payloadHash: 'hash-xyz',
      registerId,
      deviceId,
      shiftId,
      ticketNumber: 'POS-01-000002',
      paymentMethod: 'card',
      lines: [
        {
          id: 'l1',
          productId,
          quantity: '5',
          unitPriceMinor: '250',
        },
      ],
      occurredAt: fixedNow.toISOString(),
    });

    expect(replayResult.ok).toBe(true);
    if (!replayResult.ok) return;
    expect(replayResult.value.status).toBe('duplicate');
  });

  it('resolves negative stock conflict with compensatory adjustment', async () => {
    const conflictRes = InventoryConflict.createNegativeStock({
      id: asId<InventoryConflictId>('conflict-1'),
      tenantId,
      productId,
      stockBefore: 0n,
      quantityAttempted: 30_000n,
      stockAfter: -30_000n,
      shortageQuantity: 30_000n,
      detectedAt: fixedNow,
    });
    if (!conflictRes.ok) throw new Error('Conflict setup failed');
    const conflict = conflictRes.value;
    fakeConflicts.set(conflict.id, conflict);

    const resolveUseCase = makeResolveInventoryConflict({ uow, ctx, clock, ids: idGen });
    const result = await resolveUseCase({
      conflictId: 'conflict-1',
      resolutionType: 'adjustment_in',
      notes: 'Entrada omitida verificada fisicamente en gondola',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('resolved');
    expect(result.value.resolutionType).toBe('adjustment_in');

    const updatedConflict = fakeConflicts.get('conflict-1')!;
    expect(updatedConflict.status).toBe('resolved');
  });

  it('dispatches commands through PosCommandBus cleanly without switch/cases', async () => {
    const bus = new PosCommandBus();
    const openHandler = new OpenCashShiftCommandHandler({ uow, ctx, clock, ids: idGen });
    const saleHandler = new ProcessPosSaleCommandHandler({ uow, ctx, clock, ids: idGen });

    bus.register(openHandler);
    bus.register(saleHandler);

    const openCmd = {
      type: 'shift.open' as const,
      registerId,
      deviceId,
      initialFloatMinor: '10000',
      currency: 'USD' as const,
    };

    const openResult = await bus.dispatch<{ shiftId: string }>(openCmd);
    expect(openResult.ok).toBe(true);
    if (!openResult.ok) return;

    const createdShiftId = openResult.value.shiftId;
    expect(createdShiftId).toBeDefined();

    const saleCmd = {
      type: 'sale.issue' as const,
      operationId: 'op-bus-1',
      sequence: 1,
      payloadHash: 'hash-bus-1',
      registerId,
      deviceId,
      shiftId: createdShiftId,
      ticketNumber: 'POS-01-000099',
      paymentMethod: 'cash' as const,
      lines: [
        {
          id: 'l1',
          productId,
          quantity: '1',
          unitPriceMinor: '250',
        },
      ],
      occurredAt: fixedNow.toISOString(),
    };

    const saleResult = await bus.dispatch<ProcessPosSaleOutput>(saleCmd);
    expect(saleResult.ok).toBe(true);
    if (!saleResult.ok) return;
    expect(saleResult.value.status).toBe('processed');
  });
});
