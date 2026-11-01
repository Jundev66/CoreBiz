import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListDeliveryNotesController } from '../../../src/modules/delivery-notes/controllers/list-delivery-notes.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('ListDeliveryNotesController', () => {
  let controller: ListDeliveryNotesController;
  let listMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    listMock = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    runtimeMock = {
      queries: {
        deliveryNotes: {
          list: listMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new ListDeliveryNotesController(runtimeMock as Runtime);
  });

  it('delegates delivery notes query to read model with filter params', async () => {
    const query = { limit: 20 };

    const response = await controller.run(query);

    expect(response).toEqual({ items: [], nextCursor: null });
    expect(listMock).toHaveBeenCalledWith({
      limit: 20,
    });
  });
});
