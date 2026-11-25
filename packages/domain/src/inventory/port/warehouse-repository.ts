import type { Warehouse } from '../model/warehouse';
import type { Quantity } from '../../shared/value-objects/quantity';

export interface WarehouseRepository {
  findById(tenantId: string, id: string): Promise<Warehouse | null>;
  findByCode(tenantId: string, code: string): Promise<Warehouse | null>;
  findDefault(tenantId: string): Promise<Warehouse | null>;
  listByTenant(tenantId: string): Promise<readonly Warehouse[]>;
  getStock(tenantId: string, warehouseId: string, productId: string): Promise<Quantity>;
  adjustStock(
    tenantId: string,
    warehouseId: string,
    productId: string,
    delta: Quantity,
  ): Promise<Quantity>;
  save(warehouse: Warehouse): Promise<void>;
}
