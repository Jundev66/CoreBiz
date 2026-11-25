import type { FiscalSequenceRange, FiscalSequenceRangeRepository } from '../../domain/index';

export class InMemoryFiscalSequenceRangeRepository implements FiscalSequenceRangeRepository {
  private readonly storage = new Map<string, FiscalSequenceRange>();

  findById(tenantId: string, id: string): Promise<FiscalSequenceRange | null> {
    const range = this.storage.get(id);
    if (!range || range.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(range);
  }

  findActiveRange(
    tenantId: string,
    documentType: string,
    prefix?: string,
  ): Promise<FiscalSequenceRange | null> {
    for (const range of this.storage.values()) {
      if (
        range.tenantId === tenantId &&
        range.documentType === documentType &&
        range.status === 'ACTIVE'
      ) {
        if (prefix === undefined || range.prefix === prefix) {
          return Promise.resolve(range);
        }
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string): Promise<readonly FiscalSequenceRange[]> {
    const list: FiscalSequenceRange[] = [];
    for (const range of this.storage.values()) {
      if (range.tenantId === tenantId) {
        list.push(range);
      }
    }
    list.sort((a, b) => {
      const aTime = a.resolutionDate?.getTime() ?? 0;
      const bTime = b.resolutionDate?.getTime() ?? 0;
      return bTime - aTime;
    });
    return Promise.resolve(list);
  }

  save(range: FiscalSequenceRange): Promise<void> {
    this.storage.set(range.id, range);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
  }
}
