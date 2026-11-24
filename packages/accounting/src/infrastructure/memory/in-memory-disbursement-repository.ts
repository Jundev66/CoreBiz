import { type Disbursement, type DisbursementRepository } from '../../domain/index';

export class InMemoryDisbursementRepository implements DisbursementRepository {
  private readonly disbursements = new Map<string, Disbursement>();

  findById(tenantId: string, id: string): Promise<Disbursement | null> {
    const item = this.disbursements.get(id);
    if (!item || item.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(item);
  }

  nextDisbursementNumber(tenantId: string): Promise<bigint> {
    let max = 0n;
    for (const item of this.disbursements.values()) {
      if (item.tenantId === tenantId && item.disbursementNumber > max) {
        max = item.disbursementNumber;
      }
    }
    return Promise.resolve(max + 1n);
  }

  listByTenant(tenantId: string): Promise<readonly Disbursement[]> {
    const results: Disbursement[] = [];
    for (const item of this.disbursements.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    results.sort((a, b) => b.date.getTime() - a.date.getTime());
    return Promise.resolve(results);
  }

  save(disbursement: Disbursement): Promise<void> {
    this.disbursements.set(disbursement.id, disbursement);
    return Promise.resolve();
  }

  clear(): void {
    this.disbursements.clear();
  }
}
