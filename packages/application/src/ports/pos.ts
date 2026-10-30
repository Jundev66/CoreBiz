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
} from '@corebiz/domain';

export interface PosRegisterRepository {
  findById(id: PosRegisterId): Promise<PosRegister | null>;
  findByCode(code: string): Promise<PosRegister | null>;
  list(filter?: { status?: string }): Promise<readonly PosRegister[]>;
  save(register: PosRegister): Promise<void>;
}

export interface PosDeviceRepository {
  findById(id: PosDeviceId): Promise<PosDevice | null>;
  findByInstallationId(installationId: string): Promise<PosDevice | null>;
  save(device: PosDevice): Promise<void>;
}

export interface CashShiftRepository {
  findById(id: PosShiftId): Promise<CashShift | null>;
  findActiveByRegisterId(registerId: PosRegisterId): Promise<CashShift | null>;
  save(shift: CashShift): Promise<void>;
}

export interface PosSaleRepository {
  findById(id: PosSaleId): Promise<PosSale | null>;
  findByOperationId(operationId: string): Promise<PosSale | null>;
  save(sale: PosSale): Promise<void>;
}

export interface InventoryConflictRepository {
  findById(id: InventoryConflictId): Promise<InventoryConflict | null>;
  findOpenByProductId(productId: string): Promise<InventoryConflict | null>;
  list(filter?: { status?: string }): Promise<readonly InventoryConflict[]>;
  save(conflict: InventoryConflict): Promise<void>;
}

export interface PosSyncOperation {
  readonly id: string;
  readonly operationId: string;
  readonly deviceId: string;
  readonly operationType: string;
  readonly sequence: number;
  readonly payloadHash: string;
  readonly status: 'received' | 'processed' | 'failed';
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly errorMessage: string | null;
}

export interface PosSyncOperationRepository {
  findByOperationId(operationId: string): Promise<PosSyncOperation | null>;
  save(operation: PosSyncOperation): Promise<void>;
}
