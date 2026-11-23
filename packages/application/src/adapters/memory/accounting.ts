import type {
  Account,
  AccountCode,
  AccountRepository,
  JournalEntry,
  JournalEntryRepository,
} from '@corebiz/domain';

export class InMemoryAccountRepository implements AccountRepository {
  constructor(private readonly store: Map<string, Account> = new Map()) {}

  findById(tenantId: string, id: string): Promise<Account | null> {
    const acc = this.store.get(id);
    if (!acc || acc.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(acc);
  }

  findByCode(tenantId: string, code: AccountCode): Promise<Account | null> {
    for (const acc of this.store.values()) {
      if (acc.tenantId === tenantId && acc.code.value === code.value) {
        return Promise.resolve(acc);
      }
    }
    return Promise.resolve(null);
  }

  listByTenant(tenantId: string): Promise<readonly Account[]> {
    const list: Account[] = [];
    for (const acc of this.store.values()) {
      if (acc.tenantId === tenantId) {
        list.push(acc);
      }
    }
    return Promise.resolve(list);
  }

  save(account: Account): Promise<void> {
    this.store.set(account.id, account);
    return Promise.resolve();
  }
}

export class InMemoryJournalEntryRepository implements JournalEntryRepository {
  constructor(private readonly store: Map<string, JournalEntry> = new Map()) {}

  findById(tenantId: string, id: string): Promise<JournalEntry | null> {
    const entry = this.store.get(id);
    if (!entry || entry.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(entry);
  }

  nextEntryNumber(tenantId: string): Promise<bigint> {
    let max = 0n;
    for (const entry of this.store.values()) {
      if (entry.tenantId === tenantId && entry.entryNumber > max) {
        max = entry.entryNumber;
      }
    }
    return Promise.resolve(max + 1n);
  }

  save(entry: JournalEntry): Promise<void> {
    this.store.set(entry.id, entry);
    return Promise.resolve();
  }

  listByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    const list: JournalEntry[] = [];
    for (const entry of this.store.values()) {
      if (entry.tenantId === tenantId && entry.date >= startDate && entry.date <= endDate) {
        list.push(entry);
      }
    }
    return Promise.resolve(list);
  }
}
