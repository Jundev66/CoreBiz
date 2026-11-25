import type { InterWarehouseTransfer, TransferRepository } from '@corebiz/domain';

export interface ListTransfersQuery {
  readonly tenantId: string;
}

export class ListTransfersQueryHandler {
  constructor(private readonly transferRepo: TransferRepository) {}

  async execute(query: ListTransfersQuery): Promise<readonly InterWarehouseTransfer[]> {
    return this.transferRepo.listByTenant(query.tenantId);
  }
}
