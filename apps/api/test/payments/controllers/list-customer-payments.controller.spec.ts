import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCustomerPaymentsController } from '../../../src/modules/payments/controllers/list-customer-payments.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListCustomerPaymentsController', () => {
  let controller: ListCustomerPaymentsController;
  let listMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    listMock = vi.fn().mockResolvedValue({
      items: [
        {
          id: '018e245a-0000-7000-8000-000000000601',
          number: 'REC-000001',
          customerId: '018e245a-0000-7000-8000-000000000002',
          customerName: 'Cliente Demo',
          amount: '50.00',
          currency: 'USD',
          paymentMethod: 'cash_usd',
          reference: 'REF-001',
          status: 'applied',
          paidAt: new Date('2026-03-15T12:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    runtimeMock = {
      queries: {
        payments: {
          list: listMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new ListCustomerPaymentsController(runtimeMock as Runtime);
  });

  it('delegates payments query to runtime queries', async () => {
    const query = { limit: 20 };

    const response = await controller.run(query);

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.number).toBe('REC-000001');
    expect(listMock).toHaveBeenCalledWith({
      limit: 20,
    });
  });
});
