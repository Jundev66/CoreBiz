import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListSuppliersController } from '../../../src/modules/purchasing/controllers/list-suppliers.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListSuppliersController', () => {
  let controller: ListSuppliersController;
  let suppliersMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    suppliersMock = vi.fn().mockResolvedValue({
      items: [
        {
          id: '018e245a-0000-7000-8000-000000000401',
          code: 'PRV-0001',
          name: 'Distribuidora Central C.A.',
          taxId: 'J-12345678-9',
          email: 'contacto@distribuidoracentral.com',
          phone: '+584121234567',
          contactName: 'Carlos Mendoza',
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
        purchasing: {
          suppliers: suppliersMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new ListSuppliersController(runtimeMock as Runtime);
  });

  it('delegates suppliers query to runtime queries', async () => {
    const query = { limit: 20 };

    const response = await controller.run(query);

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.code).toBe('PRV-0001');
    expect(suppliersMock).toHaveBeenCalledWith({
      limit: 20,
    });
  });
});
