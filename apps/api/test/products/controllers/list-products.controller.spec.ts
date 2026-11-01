import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListProductsController } from '../../../src/modules/products/controllers/list-products.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListProductsController', () => {
  let controller: ListProductsController;
  let listMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    listMock = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    runtimeMock = {
      queries: {
        products: {
          list: listMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new ListProductsController(runtimeMock as Runtime);
  });

  it('delegates catalog query to read model with filter params', async () => {
    const query = { limit: 20, search: 'Harina' };

    const response = await controller.run(query);

    expect(response).toEqual({ items: [], nextCursor: null });
    expect(listMock).toHaveBeenCalledWith({
      limit: 20,
      search: 'Harina',
    });
  });
});
