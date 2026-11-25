import type { Quantity } from '@corebiz/shared-kernel';
import type { WarehouseRepository } from '@corebiz/domain';

export interface GetWarehouseStockQuery {
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly productId: string;
}

export class GetWarehouseStockQueryHandler {
  constructor(private readonly warehouseRepo: WarehouseRepository) {}

  async execute(query: GetWarehouseStockQuery): Promise<Quantity> {
    return this.warehouseRepo.getStock(query.tenantId, query.warehouseId, query.productId);
  }
}
