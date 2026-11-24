import type {
  Account,
  AccountCode,
  AccountRepository,
  JournalEntry,
  JournalEntryRepository,
  BankStatement,
  BankStatementRepository,
  TreasurySwap,
  TreasurySwapRepository,
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

export class InMemoryBankStatementRepository implements BankStatementRepository {
  private readonly store: Map<string, BankStatement> = new Map();

  findById(tenantId: string, id: string): Promise<BankStatement | null> {
    const statement = this.store.get(id);
    if (!statement || statement.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(statement);
  }

  listByTenant(tenantId: string, bankAccountId?: string): Promise<readonly BankStatement[]> {
    const list: BankStatement[] = [];
    for (const statement of this.store.values()) {
      if (statement.tenantId === tenantId) {
        if (!bankAccountId || statement.bankAccountId === bankAccountId) {
          list.push(statement);
        }
      }
    }
    list.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    return Promise.resolve(list);
  }

  save(statement: BankStatement): Promise<void> {
    this.store.set(statement.id, statement);
    return Promise.resolve();
  }
}

export class InMemoryTreasurySwapRepository implements TreasurySwapRepository {
  private readonly store: Map<string, TreasurySwap> = new Map();

  findById(tenantId: string, id: string): Promise<TreasurySwap | null> {
    const swap = this.store.get(id);
    if (!swap || swap.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(swap);
  }

  nextSwapNumber(tenantId: string): Promise<bigint> {
    let max = 0n;
    for (const swap of this.store.values()) {
      if (swap.tenantId === tenantId && swap.swapNumber > max) {
        max = swap.swapNumber;
      }
    }
    return Promise.resolve(max + 1n);
  }

  listByTenant(tenantId: string): Promise<readonly TreasurySwap[]> {
    const list: TreasurySwap[] = [];
    for (const swap of this.store.values()) {
      if (swap.tenantId === tenantId) {
        list.push(swap);
      }
    }
    list.sort((a, b) => b.date.getTime() - a.date.getTime());
    return Promise.resolve(list);
  }

  save(swap: TreasurySwap): Promise<void> {
    this.store.set(swap.id, swap);
    return Promise.resolve();
  }
}
