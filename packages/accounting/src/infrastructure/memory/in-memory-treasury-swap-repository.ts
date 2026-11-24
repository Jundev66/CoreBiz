import { type TreasurySwap, type TreasurySwapRepository } from '../../domain/index';

export class InMemoryTreasurySwapRepository implements TreasurySwapRepository {
  private readonly swaps = new Map<string, TreasurySwap>();

  findById(tenantId: string, id: string): Promise<TreasurySwap | null> {
    const swap = this.swaps.get(id);
    if (!swap || swap.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(swap);
  }

  nextSwapNumber(tenantId: string): Promise<bigint> {
    let max = 0n;
    for (const swap of this.swaps.values()) {
      if (swap.tenantId === tenantId && swap.swapNumber > max) {
        max = swap.swapNumber;
      }
    }
    return Promise.resolve(max + 1n);
  }

  listByTenant(tenantId: string): Promise<readonly TreasurySwap[]> {
    const results: TreasurySwap[] = [];
    for (const swap of this.swaps.values()) {
      if (swap.tenantId === tenantId) {
        results.push(swap);
      }
    }
    results.sort((a, b) => b.date.getTime() - a.date.getTime());
    return Promise.resolve(results);
  }

  save(swap: TreasurySwap): Promise<void> {
    this.swaps.set(swap.id, swap);
    return Promise.resolve();
  }

  clear(): void {
    this.swaps.clear();
  }
}
