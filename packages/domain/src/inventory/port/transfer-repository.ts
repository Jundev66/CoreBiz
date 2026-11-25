import type { InterWarehouseTransfer } from '../model/inter-warehouse-transfer';

export interface TransferRepository {
  findById(tenantId: string, id: string): Promise<InterWarehouseTransfer | null>;
  findByNumber(tenantId: string, transferNumber: string): Promise<InterWarehouseTransfer | null>;
  listByTenant(tenantId: string): Promise<readonly InterWarehouseTransfer[]>;
  nextTransferNumber(tenantId: string): Promise<string>;
  save(transfer: InterWarehouseTransfer): Promise<void>;
}
