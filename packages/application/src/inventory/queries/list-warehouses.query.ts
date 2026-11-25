import type { Warehouse, WarehouseRepository } from '@corebiz/domain';

export interface ListWarehousesQuery {
  readonly tenantId: string;
}

export class ListWarehousesQueryHandler {
  constructor(private readonly warehouseRepo: WarehouseRepository) {}

  async execute(query: ListWarehousesQuery): Promise<readonly Warehouse[]> {
    return this.warehouseRepo.listByTenant(query.tenantId);
  }
}
