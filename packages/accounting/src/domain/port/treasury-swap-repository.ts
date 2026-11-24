import type { TreasurySwap } from '../model/treasury-swap';

export interface TreasurySwapRepository {
  findById(tenantId: string, id: string): Promise<TreasurySwap | null>;
  nextSwapNumber(tenantId: string): Promise<bigint>;
  save(swap: TreasurySwap): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly TreasurySwap[]>;
}
