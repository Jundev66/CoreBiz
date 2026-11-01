import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCustomersController } from '../../../src/modules/customers/controllers/list-customers.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListCustomersController', () => {
  let controller: ListCustomersController;
  let listMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    listMock = vi.fn().mockResolvedValue({
      items: [
        {
          id: '018e245a-0000-7000-8000-000000000002',
          code: 'CLI-0001',
          name: 'Bodegón Bella Vista',
          taxId: 'J-12345678-0',
          email: 'contacto@bellavista.com',
          phone: '+584141234567',
          archived: false,
          createdAt: new Date('2026-01-01T08:00:00Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    runtimeMock = {
      queries: {
        customers: {
          list: listMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new ListCustomersController(runtimeMock as Runtime);
  });

  it('delegates customers query to runtime queries', async () => {
    const query = { limit: 20 };

    const response = await controller.run(query);

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.code).toBe('CLI-0001');
    expect(listMock).toHaveBeenCalledWith({
      limit: 20,
    });
  });
});
