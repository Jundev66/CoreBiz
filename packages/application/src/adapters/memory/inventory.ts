import { Quantity } from '@corebiz/shared-kernel';
import type {
  Warehouse,
  WarehouseRepository,
  InterWarehouseTransfer,
  TransferRepository,
  PhysicalInventoryAudit,
  PhysicalInventoryAuditRepository,
} from '@corebiz/domain';

export class InMemoryWarehouseRepository implements WarehouseRepository {
  private readonly storage = new Map<string, Warehouse>();
  private readonly stockStorage = new Map<string, Quantity>();

  findById(tenantId: string, id: string): Promise<Warehouse | null> {
    const wh = this.storage.get(id);
    if (!wh || wh.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(wh);
  }

  findByCode(tenantId: string, code: string): Promise<Warehouse | null> {
    const upperCode = code.toUpperCase();
    for (const wh of this.storage.values()) {
      if (wh.tenantId === tenantId && wh.code === upperCode) {
        return Promise.resolve(wh);
      }
    }
    return Promise.resolve(null);
  }

  findDefault(tenantId: string): Promise<Warehouse | null> {
    for (const wh of this.storage.values()) {
      if (wh.tenantId === tenantId && wh.isDefault) {
        return Promise.resolve(wh);
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string): Promise<readonly Warehouse[]> {
    const list: Warehouse[] = [];
    for (const wh of this.storage.values()) {
      if (wh.tenantId === tenantId) {
        list.push(wh);
      }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(list);
  }

  getStock(tenantId: string, warehouseId: string, productId: string): Promise<Quantity> {
    const key = `${tenantId}:${warehouseId}:${productId}`;
    const stock = this.stockStorage.get(key) ?? Quantity.zero();
    return Promise.resolve(stock);
  }

  setStock(tenantId: string, warehouseId: string, productId: string, qty: Quantity): void {
    const key = `${tenantId}:${warehouseId}:${productId}`;
    this.stockStorage.set(key, qty);
  }

  adjustStock(
    tenantId: string,
    warehouseId: string,
    productId: string,
    delta: Quantity,
  ): Promise<Quantity> {
    const key = `${tenantId}:${warehouseId}:${productId}`;
    const current = this.stockStorage.get(key) ?? Quantity.zero();
    const newScaled = current.scaledValue + delta.scaledValue;
    const newQty = Quantity.fromScaled(newScaled);
    this.stockStorage.set(key, newQty);
    return Promise.resolve(newQty);
  }

  save(warehouse: Warehouse): Promise<void> {
    this.storage.set(warehouse.id, warehouse);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.stockStorage.clear();
  }
}

export class InMemoryTransferRepository implements TransferRepository {
  private readonly storage = new Map<string, InterWarehouseTransfer>();
  private sequenceCounter = 0;

  findById(tenantId: string, id: string): Promise<InterWarehouseTransfer | null> {
    const transfer = this.storage.get(id);
    if (!transfer || transfer.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(transfer);
  }

  findByNumber(tenantId: string, transferNumber: string): Promise<InterWarehouseTransfer | null> {
    for (const transfer of this.storage.values()) {
      if (transfer.tenantId === tenantId && transfer.transferNumber === transferNumber) {
        return Promise.resolve(transfer);
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string): Promise<readonly InterWarehouseTransfer[]> {
    const list: InterWarehouseTransfer[] = [];
    for (const transfer of this.storage.values()) {
      if (transfer.tenantId === tenantId) {
        list.push(transfer);
      }
    }
    list.sort((a, b) => {
      const aTime = a.initiatedAt?.getTime() ?? 0;
      const bTime = b.initiatedAt?.getTime() ?? 0;
      return bTime - aTime;
    });
    return Promise.resolve(list);
  }

  nextTransferNumber(_tenantId: string): Promise<string> {
    this.sequenceCounter++;
    const padded = this.sequenceCounter.toString().padStart(6, '0');
    return Promise.resolve(`TRF-${padded}`);
  }

  save(transfer: InterWarehouseTransfer): Promise<void> {
    this.storage.set(transfer.id, transfer);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.sequenceCounter = 0;
  }
}

export class InMemoryPhysicalInventoryAuditRepository implements PhysicalInventoryAuditRepository {
  private readonly storage = new Map<string, PhysicalInventoryAudit>();
  private sequenceCounter = 0;

  findById(tenantId: string, id: string): Promise<PhysicalInventoryAudit | null> {
    const audit = this.storage.get(id);
    if (!audit || audit.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(audit);
  }

  findByNumber(tenantId: string, auditNumber: string): Promise<PhysicalInventoryAudit | null> {
    for (const audit of this.storage.values()) {
      if (audit.tenantId === tenantId && audit.auditNumber === auditNumber) {
        return Promise.resolve(audit);
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string, warehouseId?: string): Promise<readonly PhysicalInventoryAudit[]> {
    const list: PhysicalInventoryAudit[] = [];
    for (const audit of this.storage.values()) {
      if (audit.tenantId === tenantId) {
        if (!warehouseId || audit.warehouseId === warehouseId) {
          list.push(audit);
        }
      }
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(list);
  }

  nextAuditNumber(_tenantId: string): Promise<string> {
    this.sequenceCounter++;
    const padded = this.sequenceCounter.toString().padStart(6, '0');
    return Promise.resolve(`INV-AUD-${padded}`);
  }

  save(audit: PhysicalInventoryAudit): Promise<void> {
    this.storage.set(audit.id, audit);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.sequenceCounter = 0;
  }
}
