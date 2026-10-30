import { describe, it, expect } from 'vitest';
import { asId, type TenantId, type UserId, type ProductId } from '../shared/entity';
import { Money } from '../shared/value-objects/money';
import { Quantity } from '../shared/value-objects/quantity';
import { PosRegister } from './pos-register';
import { PosDevice } from './pos-device';
import { CashShift } from './cash-shift';
import { PosSale } from './pos-sale';
import { InventoryConflict } from './inventory-conflict';
import type {
  PosRegisterId,
  PosDeviceId,
  PosShiftId,
  PosSaleId,
  InventoryConflictId,
} from './pos-ids';

describe('PosRegister Aggregate', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const registerId = asId<PosRegisterId>('018e245a-0000-7000-8000-000000000002');
  const testDate = new Date('2026-10-30T10:00:00Z');

  it('creates an active register with valid code and name', () => {
    const result = PosRegister.create({
      id: registerId,
      tenantId,
      name: 'Caja Mostrador 1',
      code: 'POS-01',
      now: testDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.id).toBe(registerId);
    expect(result.value.code).toBe('POS-01');
    expect(result.value.name).toBe('Caja Mostrador 1');
    expect(result.value.status).toBe('active');
  });

  it('rejects invalid code format', () => {
    const result = PosRegister.create({
      id: registerId,
      tenantId,
      name: 'Caja Invalida',
      code: '!',
      now: testDate,
    });

    expect(result.ok).toBe(false);
  });

  it('activates, deactivates and renames correctly', () => {
    const reg = PosRegister.create({
      id: registerId,
      tenantId,
      name: 'Caja 1',
      code: 'POS-01',
      now: testDate,
    });
    if (!reg.ok) throw new Error('Setup failed');

    const register = reg.value;
    register.deactivate(testDate);
    expect(register.status).toBe('inactive');

    register.activate(testDate);
    expect(register.status).toBe('active');

    const renameResult = register.rename('Caja Principal', testDate);
    expect(renameResult.ok).toBe(true);
    expect(register.name).toBe('Caja Principal');
  });
});

describe('PosDevice Aggregate', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const deviceId = asId<PosDeviceId>('018e245a-0000-7000-8000-000000000003');
  const installationId = '018e245a-1111-7000-8000-000000000000';
  const testDate = new Date('2026-10-30T10:00:00Z');

  it('creates a pending device', () => {
    const result = PosDevice.create({
      id: deviceId,
      tenantId,
      installationId,
      name: 'Tablet Mostrador',
      platform: 'Android',
      browser: 'Chrome',
      now: testDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('pending');
    expect(result.value.deviceTokenHash).toBeNull();
  });

  it('authorizes and touches a device', () => {
    const dev = PosDevice.create({
      id: deviceId,
      tenantId,
      installationId,
      name: 'Tablet',
      now: testDate,
    });
    if (!dev.ok) throw new Error('Setup failed');

    const device = dev.value;
    const authResult = device.authorize('sha256-hash-token', testDate);
    expect(authResult.ok).toBe(true);
    expect(device.status).toBe('active');
    expect(device.deviceTokenHash).toBe('sha256-hash-token');
    expect(device.lastSeenAt).toEqual(testDate);

    const touchDate = new Date('2026-10-30T11:00:00Z');
    device.touch(touchDate);
    expect(device.lastSeenAt).toEqual(touchDate);
  });

  it('prevents authorization once revoked', () => {
    const dev = PosDevice.create({
      id: deviceId,
      tenantId,
      installationId,
      name: 'Tablet',
      now: testDate,
    });
    if (!dev.ok) throw new Error('Setup failed');

    const device = dev.value;
    device.revoke();
    expect(device.status).toBe('revoked');

    const retryAuth = device.authorize('another-hash', testDate);
    expect(retryAuth.ok).toBe(false);
  });
});

describe('CashShift Aggregate & Blind Cash Reconciliation', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const shiftId = asId<PosShiftId>('018e245a-0000-7000-8000-000000000010');
  const registerId = asId<PosRegisterId>('018e245a-0000-7000-8000-000000000002');
  const deviceId = asId<PosDeviceId>('018e245a-0000-7000-8000-000000000003');
  const cashierId = asId<UserId>('018e245a-0000-7000-8000-000000000004');
  const initialFloat = Money.fromMinor(10_000n, 'USD');
  const testDate = new Date('2026-10-30T08:00:00Z');

  it('opens a shift with initial float and records domain event', () => {
    const result = CashShift.open({
      id: shiftId,
      tenantId,
      registerId,
      deviceId,
      openedByUserId: cashierId,
      initialFloat,
      now: testDate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shift = result.value;
    expect(shift.status).toBe('open');
    expect(shift.initialFloat.minorUnits).toBe(10_000n);
    expect(shift.currentExpectedCash().minorUnits).toBe(10_000n);

    const events = shift.pullDomainEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('pos.shift.opened');
  });

  it('tracks cash sales and cash movements correctly', () => {
    const shiftRes = CashShift.open({
      id: shiftId,
      tenantId,
      registerId,
      deviceId,
      openedByUserId: cashierId,
      initialFloat,
      now: testDate,
    });
    if (!shiftRes.ok) throw new Error('Setup failed');
    const shift = shiftRes.value;

    shift.recordCashSale(Money.fromMinor(5_000n, 'USD'));
    expect(shift.currentExpectedCash().minorUnits).toBe(15_000n);

    shift.recordCashMovement({
      id: 'mov-1',
      type: 'cash_in',
      amount: Money.fromMinor(2_000n, 'USD'),
      reason: 'Cambio extra aportado por supervisor',
      occurredAt: testDate,
    });
    expect(shift.currentExpectedCash().minorUnits).toBe(17_000n);

    shift.recordCashMovement({
      id: 'mov-2',
      type: 'cash_out',
      amount: Money.fromMinor(3_000n, 'USD'),
      reason: 'Retiro parcial de seguridad',
      occurredAt: testDate,
    });
    expect(shift.currentExpectedCash().minorUnits).toBe(14_000n);
  });

  it('rejects cash withdrawals greater than current cash', () => {
    const shiftRes = CashShift.open({
      id: shiftId,
      tenantId,
      registerId,
      deviceId,
      openedByUserId: cashierId,
      initialFloat,
      now: testDate,
    });
    if (!shiftRes.ok) throw new Error('Setup failed');
    const shift = shiftRes.value;

    const withdrawal = shift.recordCashMovement({
      id: 'mov-fail',
      type: 'cash_out',
      amount: Money.fromMinor(20_000n, 'USD'),
      reason: 'Retiro excesivo',
      occurredAt: testDate,
    });

    expect(withdrawal.ok).toBe(false);
  });

  it('performs blind cash reconciliation calculating variance accurately', () => {
    const shiftRes = CashShift.open({
      id: shiftId,
      tenantId,
      registerId,
      deviceId,
      openedByUserId: cashierId,
      initialFloat,
      now: testDate,
    });
    if (!shiftRes.ok) throw new Error('Setup failed');
    const shift = shiftRes.value;

    shift.recordCashSale(Money.fromMinor(15_000n, 'USD'));
    expect(shift.currentExpectedCash().minorUnits).toBe(25_000n);

    const declaredCash = Money.fromMinor(24_500n, 'USD');
    const closeResult = shift.close({
      declaredCash,
      closedByUserId: cashierId,
      closedAt: new Date('2026-10-30T16:00:00Z'),
      notes: 'Faltante de 5 dolares justificado en cambio pequeno',
    });

    expect(closeResult.ok).toBe(true);
    expect(shift.status).toBe('closed');
    expect(shift.declaredCash?.minorUnits).toBe(24_500n);
    expect(shift.systemCash?.minorUnits).toBe(25_000n);
    expect(shift.cashVariance?.minorUnits).toBe(-500n);

    const events = shift.pullDomainEvents();
    const closeEvent = events.find((e) => e.type === 'pos.shift.closed');
    expect(closeEvent).toBeDefined();
    expect(closeEvent?.payload['varianceMinor']).toBe('-500');
  });

  it('rejects operations after shift is closed', () => {
    const shiftRes = CashShift.open({
      id: shiftId,
      tenantId,
      registerId,
      deviceId,
      openedByUserId: cashierId,
      initialFloat,
      now: testDate,
    });
    if (!shiftRes.ok) throw new Error('Setup failed');
    const shift = shiftRes.value;

    shift.close({
      declaredCash: initialFloat,
      closedByUserId: cashierId,
      closedAt: testDate,
    });

    const addSale = shift.recordCashSale(Money.fromMinor(1_000n, 'USD'));
    expect(addSale.ok).toBe(false);

    const reClose = shift.close({
      declaredCash: initialFloat,
      closedByUserId: cashierId,
      closedAt: testDate,
    });
    expect(reClose.ok).toBe(false);
  });
});

describe('PosSale Aggregate', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const saleId = asId<PosSaleId>('018e245a-0000-7000-8000-000000000020');
  const shiftId = asId<PosShiftId>('018e245a-0000-7000-8000-000000000010');
  const registerId = asId<PosRegisterId>('018e245a-0000-7000-8000-000000000002');
  const deviceId = asId<PosDeviceId>('018e245a-0000-7000-8000-000000000003');
  const cashierId = asId<UserId>('018e245a-0000-7000-8000-000000000004');
  const productId = asId<ProductId>('018e245a-0000-7000-8000-000000000005');
  const occurredAt = new Date('2026-10-30T10:30:00Z');
  const receivedAt = new Date('2026-10-30T10:30:05Z');
  const postedAt = new Date('2026-10-30T10:30:06Z');

  it('computes line totals, tax and grand total with high precision', () => {
    const qtyRes = Quantity.of('3');
    if (!qtyRes.ok) throw new Error('Quantity setup failed');
    const quantity = qtyRes.value;
    const unitPrice = Money.fromMinor(250n, 'USD');

    const result = PosSale.create({
      id: saleId,
      tenantId,
      registerId,
      deviceId,
      shiftId,
      cashierUserId: cashierId,
      operationId: 'op-12345',
      ticketNumber: 'POS-01-000001',
      paymentMethod: 'cash',
      lines: [
        {
          id: 'line-1',
          productId,
          quantity,
          unitPrice,
        },
      ],
      taxRateBp: 1600,
      occurredAt,
      receivedAt,
      postedAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = result.value;
    expect(sale.lines.length).toBe(1);
    expect(sale.lines[0]?.lineTotal.minorUnits).toBe(750n);
    expect(sale.subtotal.minorUnits).toBe(750n);
    expect(sale.tax.minorUnits).toBe(120n);
    expect(sale.total.minorUnits).toBe(870n);
    expect(sale.status).toBe('completed');
  });

  it('supports uncataloged contingent sale items', () => {
    const qtyRes = Quantity.of('1');
    if (!qtyRes.ok) throw new Error('Quantity setup failed');
    const quantity = qtyRes.value;
    const unitPrice = Money.fromMinor(1_500n, 'USD');

    const result = PosSale.create({
      id: saleId,
      tenantId,
      registerId,
      deviceId,
      shiftId,
      cashierUserId: cashierId,
      operationId: 'op-99999',
      ticketNumber: 'POS-01-000002',
      paymentMethod: 'card',
      lines: [
        {
          id: 'line-quick',
          productId: null,
          temporaryName: 'Articulo manual no catalogado',
          barcodeScanned: '7791234567890',
          quantity,
          unitPrice,
        },
      ],
      taxRateBp: 0,
      occurredAt,
      receivedAt,
      postedAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.lines[0]?.productId).toBeNull();
    expect(result.value.lines[0]?.temporaryName).toBe('Articulo manual no catalogado');
    expect(result.value.lines[0]?.barcodeScanned).toBe('7791234567890');
  });

  it('allows voiding a completed sale with audit event', () => {
    const qtyRes = Quantity.of('1');
    if (!qtyRes.ok) throw new Error('Quantity setup failed');
    const quantity = qtyRes.value;
    const unitPrice = Money.fromMinor(500n, 'USD');

    const saleRes = PosSale.create({
      id: saleId,
      tenantId,
      registerId,
      deviceId,
      shiftId,
      cashierUserId: cashierId,
      operationId: 'op-void',
      ticketNumber: 'POS-01-000003',
      paymentMethod: 'cash',
      lines: [
        {
          id: 'l1',
          productId,
          quantity,
          unitPrice,
        },
      ],
      taxRateBp: 0,
      occurredAt,
      receivedAt,
      postedAt,
    });
    if (!saleRes.ok) throw new Error('Sale setup failed');
    const sale = saleRes.value;

    const voidResult = sale.void(cashierId, 'Error en digitacion de medio de pago', postedAt);
    expect(voidResult.ok).toBe(true);
    expect(sale.status).toBe('voided');

    const events = sale.pullDomainEvents();
    const voidEvent = events.find((e) => e.type === 'pos.sale.voided');
    expect(voidEvent).toBeDefined();
    expect(voidEvent?.payload['reason']).toBe('Error en digitacion de medio de pago');
  });
});

describe('InventoryConflict Aggregate', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const conflictId = asId<InventoryConflictId>('018e245a-0000-7000-8000-000000000030');
  const productId = asId<ProductId>('018e245a-0000-7000-8000-000000000005');
  const adminId = asId<UserId>('018e245a-0000-7000-8000-000000000099');
  const testDate = new Date('2026-10-30T10:00:00Z');

  it('creates and investigates a negative stock conflict', () => {
    const result = InventoryConflict.createNegativeStock({
      id: conflictId,
      tenantId,
      productId,
      stockBefore: 20_000n,
      quantityAttempted: 50_000n,
      stockAfter: -30_000n,
      shortageQuantity: 30_000n,
      detectedAt: testDate,
      saleId: 'sale-001',
      stockMovementId: 'mov-001',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const conflict = result.value;
    expect(conflict.status).toBe('open');
    expect(conflict.conflictType).toBe('negative_stock');
    expect(conflict.shortageQuantity).toBe(30_000n);
    expect(conflict.relations.length).toBe(1);

    const assignResult = conflict.assignTo(adminId);
    expect(assignResult.ok).toBe(true);
    expect(conflict.status).toBe('investigating');
    expect(conflict.assignedTo).toBe(adminId);
  });

  it('resolves conflict with compensatory inventory movement', () => {
    const conflictRes = InventoryConflict.createNegativeStock({
      id: conflictId,
      tenantId,
      productId,
      stockBefore: 0n,
      quantityAttempted: 10_000n,
      stockAfter: -10_000n,
      shortageQuantity: 10_000n,
      detectedAt: testDate,
    });
    if (!conflictRes.ok) throw new Error('Conflict setup failed');
    const conflict = conflictRes.value;

    const resolveResult = conflict.resolve({
      resolutionType: 'adjustment_in',
      notes: 'Mercaderia fisica recepcionada en tienda sin asentar remito oficial',
      resolvedBy: adminId,
      resolvedAt: testDate,
      resolutionMovementId: 'mov-adjust-999',
    });

    expect(resolveResult.ok).toBe(true);
    expect(conflict.status).toBe('resolved');
    expect(conflict.resolutionType).toBe('adjustment_in');
    expect(conflict.relations.some((r) => r.relationType === 'resolution')).toBe(true);

    const events = conflict.pullDomainEvents();
    const resolvedEvent = events.find((e) => e.type === 'pos.conflict.resolved');
    expect(resolvedEvent).toBeDefined();
  });
});
