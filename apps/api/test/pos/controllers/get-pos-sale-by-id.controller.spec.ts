import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPosSaleByIdController } from '../../../src/modules/pos/controllers/get-pos-sale-by-id.controller';
import { Money, Quantity } from '@corebiz/domain';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('GetPosSaleByIdController', () => {
  let controller: GetPosSaleByIdController;
  let findByIdMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    findByIdMock = vi.fn().mockResolvedValue({
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
    });

    runtimeMock = {
      uow: {
        run: vi.fn(
          async (
            cb: (repos: { posSales: { findById: typeof findByIdMock } }) => Promise<unknown>,
          ) => cb({ posSales: { findById: findByIdMock } }),
        ),
      } as unknown as Runtime['uow'],
    };

    controller = new GetPosSaleByIdController(runtimeMock as Runtime);
  });

  it('delegates pos sale by id query to repository', async () => {
    const response = await controller.run('018e245a-0000-7000-8000-000000000022');

    expect(response.ticketNumber).toBe('TKT-001');
    expect(findByIdMock).toHaveBeenCalledWith('018e245a-0000-7000-8000-000000000022');
  });

  it('throws NotFoundException when sale is not found', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(controller.run('missing-id')).rejects.toThrow();
  });
});
