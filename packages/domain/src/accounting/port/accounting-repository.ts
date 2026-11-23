import { type Account } from '../model/account';
import { type AccountCode } from '../model/account-code';
import { type JournalEntry } from '../model/journal-entry';

export interface AccountRepository {
  findById(tenantId: string, id: string): Promise<Account | null>;
  findByCode(tenantId: string, code: AccountCode): Promise<Account | null>;
  listByTenant(tenantId: string): Promise<readonly Account[]>;
  save(account: Account): Promise<void>;
}

export interface JournalEntryRepository {
  findById(tenantId: string, id: string): Promise<JournalEntry | null>;
  nextEntryNumber(tenantId: string): Promise<bigint>;
  save(entry: JournalEntry): Promise<void>;
  listByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<readonly JournalEntry[]>;
}
