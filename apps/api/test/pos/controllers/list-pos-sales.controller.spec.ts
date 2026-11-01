import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPosSalesController } from '../../../src/modules/pos/controllers/list-pos-sales.controller';
import { Money, Quantity } from '@corebiz/domain';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListPosSalesController', () => {
  let controller: ListPosSalesController;
  let listMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    listMock = vi.fn().mockResolvedValue([
      {
        id: '018e245a-0000-7000-8000-000000000022',
        ticketNumber: 'TKT-001',
        status: 'posted',
        paymentMethod: 'cash_usd',
        subtotal: Money.of(25, 'USD'),
        tax: Money.of(4, 'USD'),
        total: Money.of(29, 'USD'),
        occurredAt: new Date('2026-03-15T12:00:00.000Z'),
        postedAt: new Date('2026-03-15T12:00:00.000Z'),
        lines: [
          {
            id: 'line-1',
            productId: '018e245a-0000-7000-8000-000000000101',
            temporaryName: 'Harina de Trigo',
            barcodeScanned: '7591001000011',
            quantity: Quantity.of(2),
            unitPrice: Money.of(12.5, 'USD'),
            lineTotal: Money.of(25, 'USD'),
          },
        ],
      },
    ]);

    runtimeMock = {
      uow: {
        run: vi.fn(
          async (cb: (repos: { posSales: { list: typeof listMock } }) => Promise<unknown>) =>
            cb({ posSales: { list: listMock } }),
        ),
      } as unknown as Runtime['uow'],
    };

    controller = new ListPosSalesController(runtimeMock as Runtime);
  });

  it('delegates pos sales list query to posSales repository', async () => {
    const response = await controller.run('10');

    expect(response).toHaveLength(1);
    expect(response[0]?.ticketNumber).toBe('TKT-001');
    expect(listMock).toHaveBeenCalledWith({ limit: 10 });
  });
});
