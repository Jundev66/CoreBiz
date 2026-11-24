import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordPartnerCashDrawingController } from '../../../src/modules/accounting/controllers/record-partner-cash-drawing.controller';
import { RecordPartnerStockDrawingController } from '../../../src/modules/accounting/controllers/record-partner-stock-drawing.controller';
import { ListPartnerDrawingsController } from '../../../src/modules/accounting/controllers/list-partner-drawings.controller';
import { ok, Money } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('Partner Drawings Controllers', () => {
  const tenantId = '018e245a-0000-7000-8000-000000000001';
  let cashController: RecordPartnerCashDrawingController;
  let stockController: RecordPartnerStockDrawingController;
  let listController: ListPartnerDrawingsController;
  let useCasesMock: {
    recordPartnerCashDrawing: { execute: ReturnType<typeof vi.fn> };
    recordPartnerStockDrawing: { execute: ReturnType<typeof vi.fn> };
    listPartnerDrawings: { execute: ReturnType<typeof vi.fn> };
  };
  let tenantCtxMock: TenantContext;

  const mockCashDrawing = {
    id: 'drawing-cash-01',
    tenantId,
    drawingNumber: 5n,
    drawingType: 'CASH' as const,
    date: new Date('2026-11-24T12:00:00Z'),
    partnerId: 'partner-01',
    partnerName: 'Socio Demo',
    drawingAccountId: 'acc-drawing',
    creditAccountId: 'acc-cash',
    currency: 'USD' as const,
    amount: Money.fromMinor(20000n, 'USD'),
    operatorUserId: 'user-01',
    notes: 'Retiro efectivo socio',
    journalEntryId: 'je-01',
    status: 'COMPLETED' as const,
    createdAt: new Date('2026-11-24T12:00:00Z'),
  };

  const mockStockDrawing = {
    id: 'drawing-stock-01',
    tenantId,
    drawingNumber: 6n,
    drawingType: 'STOCK' as const,
    date: new Date('2026-11-24T13:00:00Z'),
    partnerId: 'partner-01',
    partnerName: 'Socio Demo',
    drawingAccountId: 'acc-drawing',
    creditAccountId: 'acc-inv',
    currency: 'USD' as const,
    amount: Money.fromMinor(10000n, 'USD'),
    productId: 'prod-01',
    quantity: 5,
    unitCost: Money.fromMinor(2000n, 'USD'),
    operatorUserId: 'user-01',
    notes: 'Autoconsumo mercancía',
    journalEntryId: 'je-02',
    status: 'COMPLETED' as const,
    createdAt: new Date('2026-11-24T13:00:00Z'),
  };

  beforeEach(() => {
    useCasesMock = {
      recordPartnerCashDrawing: {
        execute: vi.fn().mockResolvedValue(
          ok({
            drawing: mockCashDrawing,
            journalEntry: { id: 'je-01' },
          }),
        ),
      },
      recordPartnerStockDrawing: {
        execute: vi.fn().mockResolvedValue(
          ok({
            drawing: mockStockDrawing,
            journalEntry: { id: 'je-02' },
          }),
        ),
      },
      listPartnerDrawings: {
        execute: vi.fn().mockResolvedValue([mockCashDrawing, mockStockDrawing]),
      },
    };

    tenantCtxMock = {
      tenantId,
      actor: { userId: 'user-01' },
    } as unknown as TenantContext;

    cashController = new RecordPartnerCashDrawingController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
    stockController = new RecordPartnerStockDrawingController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
    listController = new ListPartnerDrawingsController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('records partner cash drawing and returns response DTO', async () => {
    const res = await cashController.run({
      date: new Date('2026-11-24'),
      partnerId: 'partner-01',
      partnerName: 'Socio Demo',
      drawingAccountId: 'acc-drawing',
      cashAccountId: 'acc-cash',
      currency: 'USD',
      amount: '200.00',
      notes: 'Retiro efectivo socio',
    });

    expect(res.id).toBe('drawing-cash-01');
    expect(res.drawingType).toBe('CASH');
    expect(res.amount).toBe('200.00');
    expect(res.status).toBe('COMPLETED');
  });

  it('records partner stock drawing and returns response DTO', async () => {
    const res = await stockController.run({
      date: new Date('2026-11-24'),
      partnerId: 'partner-01',
      partnerName: 'Socio Demo',
      drawingAccountId: 'acc-drawing',
      inventoryAccountId: 'acc-inv',
      currency: 'USD',
      productId: 'prod-01',
      quantity: 5,
      unitCost: '20.00',
      notes: 'Autoconsumo mercancía',
    });

    expect(res.id).toBe('drawing-stock-01');
    expect(res.drawingType).toBe('STOCK');
    expect(res.quantity).toBe(5);
    expect(res.amount).toBe('100.00');
    expect(res.status).toBe('COMPLETED');
  });

  it('lists partner drawings for tenant', async () => {
    const res = await listController.list();
    expect(res.length).toBe(2);
    expect(res[0]?.drawingType).toBe('CASH');
    expect(res[1]?.drawingType).toBe('STOCK');
  });
});
