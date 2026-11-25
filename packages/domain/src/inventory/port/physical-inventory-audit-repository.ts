import type { PhysicalInventoryAudit } from '../model/physical-inventory-audit';

export interface PhysicalInventoryAuditRepository {
  findById(tenantId: string, id: string): Promise<PhysicalInventoryAudit | null>;
  findByNumber(tenantId: string, auditNumber: string): Promise<PhysicalInventoryAudit | null>;
  listByTenant(tenantId: string, warehouseId?: string): Promise<readonly PhysicalInventoryAudit[]>;
  nextAuditNumber(tenantId: string): Promise<string>;
  save(audit: PhysicalInventoryAudit): Promise<void>;
}
