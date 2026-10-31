import type {
  PosRegister,
  PosRegisterId,
  PosDevice,
  PosDeviceId,
  CashShift,
  PosShiftId,
  PosSale,
  PosSaleId,
  InventoryConflict,
  InventoryConflictId,
  TenantId,
} from '@corebiz/domain';
import type {
  PosRegisterRepository,
  PosDeviceRepository,
  CashShiftRepository,
  PosSaleRepository,
  InventoryConflictRepository,
  PosSyncOperation,
  PosSyncOperationRepository,
} from '../../ports/pos';

export class InMemoryPosRegisterRepository implements PosRegisterRepository {
  constructor(
    private readonly store: Map<string, PosRegister>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): PosRegister[] {
    return [...this.store.values()].filter((r) => r.tenantId === this.tenantId);
  }

  findById(id: PosRegisterId): Promise<PosRegister | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByCode(code: string): Promise<PosRegister | null> {
    const found = this.scoped().find((r) => r.code === code);
    return Promise.resolve(found ?? null);
  }

  list(filter?: { status?: string }): Promise<readonly PosRegister[]> {
    let result = this.scoped();
    if (filter?.status) {
      result = result.filter((r) => r.status === filter.status);
    }
    return Promise.resolve(result);
  }

  save(register: PosRegister): Promise<void> {
    this.store.set(register.id, register);
    return Promise.resolve();
  }
}

export class InMemoryPosDeviceRepository implements PosDeviceRepository {
  constructor(
    private readonly store: Map<string, PosDevice>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): PosDevice[] {
    return [...this.store.values()].filter((d) => d.tenantId === this.tenantId);
  }

  findById(id: PosDeviceId): Promise<PosDevice | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByInstallationId(installationId: string): Promise<PosDevice | null> {
    const found = this.scoped().find((d) => d.installationId === installationId);
    return Promise.resolve(found ?? null);
  }

  save(device: PosDevice): Promise<void> {
    this.store.set(device.id, device);
    return Promise.resolve();
  }
}

export class InMemoryCashShiftRepository implements CashShiftRepository {
  constructor(
    private readonly store: Map<string, CashShift>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): CashShift[] {
    return [...this.store.values()].filter((s) => s.tenantId === this.tenantId);
  }

  findById(id: PosShiftId): Promise<CashShift | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findActiveByRegisterId(registerId: PosRegisterId): Promise<CashShift | null> {
    const found = this.scoped().find((s) => s.registerId === registerId && s.status === 'open');
    return Promise.resolve(found ?? null);
  }

  save(shift: CashShift): Promise<void> {
    this.store.set(shift.id, shift);
    return Promise.resolve();
  }
}

export class InMemoryPosSaleRepository implements PosSaleRepository {
  constructor(
    private readonly store: Map<string, PosSale>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): PosSale[] {
    return [...this.store.values()].filter((s) => s.tenantId === this.tenantId);
  }

  findById(id: PosSaleId): Promise<PosSale | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findByOperationId(operationId: string): Promise<PosSale | null> {
    const found = this.scoped().find((s) => s.operationId === operationId);
    return Promise.resolve(found ?? null);
  }

  list(filter?: { limit?: number; cursor?: string }): Promise<readonly PosSale[]> {
    const list = this.scoped().sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const limit = Math.min(100, Math.max(1, filter?.limit ?? 50));
    return Promise.resolve(list.slice(0, limit));
  }

  save(sale: PosSale): Promise<void> {
    this.store.set(sale.id, sale);
    return Promise.resolve();
  }
}

export class InMemoryInventoryConflictRepository implements InventoryConflictRepository {
  constructor(
    private readonly store: Map<string, InventoryConflict>,
    private readonly tenantId: TenantId,
  ) {}

  private scoped(): InventoryConflict[] {
    return [...this.store.values()].filter((c) => c.tenantId === this.tenantId);
  }

  findById(id: InventoryConflictId): Promise<InventoryConflict | null> {
    const found = this.store.get(id);
    return Promise.resolve(found && found.tenantId === this.tenantId ? found : null);
  }

  findOpenByProductId(productId: string): Promise<InventoryConflict | null> {
    const found = this.scoped().find((c) => c.productId === productId && c.status === 'open');
    return Promise.resolve(found ?? null);
  }

  list(filter?: { status?: string }): Promise<readonly InventoryConflict[]> {
    let result = this.scoped();
    if (filter?.status) {
      result = result.filter((c) => c.status === filter.status);
    }
    return Promise.resolve(result);
  }

  save(conflict: InventoryConflict): Promise<void> {
    this.store.set(conflict.id, conflict);
    return Promise.resolve();
  }
}

export class InMemoryPosSyncOperationRepository implements PosSyncOperationRepository {
  constructor(private readonly store: Map<string, PosSyncOperation>) {}

  findByOperationId(operationId: string): Promise<PosSyncOperation | null> {
    return Promise.resolve(this.store.get(operationId) ?? null);
  }

  save(operation: PosSyncOperation): Promise<void> {
    this.store.set(operation.operationId, operation);
    return Promise.resolve();
  }
}
