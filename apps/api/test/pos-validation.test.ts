import { describe, expect, it } from 'vitest';
import {
  createPosRegisterSchema,
  enrollDeviceSchema,
  openCashShiftSchema,
  recordCashMovementSchema,
  closeCashShiftSchema,
  issuePosSaleSchema,
  posSyncBatchSchema,
  resolveConflictSchema,
} from '@corebiz/contracts';

describe('POS contracts validation in API edge', () => {
  it('validates register creation schema', () => {
    const valid = createPosRegisterSchema.safeParse({
      name: 'Caja 1',
      code: 'POS-01',
    });
    expect(valid.success).toBe(true);

    const invalid = createPosRegisterSchema.safeParse({
      name: '',
      code: 'invalid code!',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates device enrollment schema', () => {
    const valid = enrollDeviceSchema.safeParse({
      installationId: '018e245a-0000-7000-8000-000000000001',
      name: 'Tablet Mostrador',
      platform: 'Android',
      browser: 'Chrome',
      pairingCode: 'PAIR-123456',
    });
    expect(valid.success).toBe(true);
  });

  it('validates cash shift schemas', () => {
    const openValid = openCashShiftSchema.safeParse({
      shiftId: 'shift-1',
      registerId: 'reg-1',
      deviceId: 'dev-1',
      initialFloatMinor: '10000',
      currency: 'USD',
      openedAt: new Date().toISOString(),
    });
    expect(openValid.success).toBe(true);

    const movementValid = recordCashMovementSchema.safeParse({
      movementId: 'mov-1',
      shiftId: 'shift-1',
      type: 'cash_out',
      amountMinor: '2500',
      reason: 'Retiro parcial de seguridad',
      occurredAt: new Date().toISOString(),
    });
    expect(movementValid.success).toBe(true);

    const closeValid = closeCashShiftSchema.safeParse({
      shiftId: 'shift-1',
      declaredCashMinor: '24500',
      closedAt: new Date().toISOString(),
      notes: 'Cuadre de turno turno tarde',
    });
    expect(closeValid.success).toBe(true);
  });

  it('validates pos sale issue schema', () => {
    const saleValid = issuePosSaleSchema.safeParse({
      saleId: 'sale-1',
      operationId: '018e245a-0000-7000-8000-000000000099',
      registerId: 'reg-1',
      deviceId: 'dev-1',
      shiftId: 'shift-1',
      ticketNumber: 'POS-01-000001',
      paymentMethod: 'cash',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          quantity: '2',
          unitPriceMinor: '500',
        },
      ],
      occurredAt: new Date().toISOString(),
    });
    expect(saleValid.success).toBe(true);
  });

  it('validates sync batch schema', () => {
    const batchValid = posSyncBatchSchema.safeParse({
      deviceId: 'dev-1',
      operations: [
        {
          operationId: '018e245a-0000-7000-8000-000000000099',
          type: 'sale.issue',
          sequence: 1,
          payloadHash: 'a'.repeat(64),
          payload: { ticketNumber: 'POS-01-000001' },
        },
      ],
    });
    expect(batchValid.success).toBe(true);
  });

  it('validates conflict resolution schema', () => {
    const resolveValid = resolveConflictSchema.safeParse({
      resolutionType: 'adjustment_in',
      notes: 'Ajuste de inventario justificado por mercaderia ingresada sin remito',
    });
    expect(resolveValid.success).toBe(true);
  });
});
