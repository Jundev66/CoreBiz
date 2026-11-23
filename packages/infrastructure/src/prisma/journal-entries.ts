import type { PrismaClient } from '@corebiz/prisma-client';
import {
  JournalEntry,
  JournalEntryLine,
  Money,
  type Currency,
  type JournalEntryRepository,
  type JournalSourceType,
} from '@corebiz/domain';
import type { Tx } from './session';

export class PrismaJournalEntryRepository implements JournalEntryRepository {
  constructor(private readonly client: PrismaClient | Tx) {}

  async findById(tenantId: string, id: string): Promise<JournalEntry | null> {
    const row = await this.client.journal_entries.findFirst({
      where: {
        tenant_id: tenantId,
        id,
      },
      include: {
        journal_entry_lines: true,
      },
    });

    if (!row) {
      return null;
    }

    return this.mapToDomain(row);
  }

  async nextEntryNumber(tenantId: string): Promise<bigint> {
    const latest = await this.client.journal_entries.findFirst({
      where: {
        tenant_id: tenantId,
      },
      orderBy: {
        entry_number: 'desc',
      },
      select: {
        entry_number: true,
      },
    });

    return latest ? latest.entry_number + 1n : 1n;
  }

  async save(entry: JournalEntry): Promise<void> {
    await this.client.journal_entries.upsert({
      where: {
        tenant_id_entry_number: {
          tenant_id: entry.tenantId,
          entry_number: entry.entryNumber,
        },
      },
      create: {
        id: entry.id,
        tenant_id: entry.tenantId,
        entry_number: entry.entryNumber,
        date: entry.date,
        description: entry.description,
        source_type: entry.sourceType,
        source_id: entry.sourceId ?? null,
        currency: entry.currency,
        total_debit_minor: entry.totalDebit,
        total_credit_minor: entry.totalCredit,
        journal_entry_lines: {
          create: entry.lines.map((line) => ({
            id: crypto.randomUUID(),
            tenant_id: entry.tenantId,
            account_id: line.accountId,
            debit_minor: line.debit.minorUnits,
            credit_minor: line.credit.minorUnits,
            currency: line.currency,
            memo: line.memo ?? null,
          })),
        },
      },
      update: {
        description: entry.description,
        source_type: entry.sourceType,
        source_id: entry.sourceId ?? null,
        total_debit_minor: entry.totalDebit,
        total_credit_minor: entry.totalCredit,
      },
    });
  }

  async listByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<readonly JournalEntry[]> {
    const rows = await this.client.journal_entries.findMany({
      where: {
        tenant_id: tenantId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        journal_entry_lines: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const entries: JournalEntry[] = [];
    for (const row of rows) {
      const entry = this.mapToDomain(row);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  private mapToDomain(row: {
    id: string;
    tenant_id: string;
    entry_number: bigint;
    date: Date;
    description: string;
    source_type: string;
    source_id: string | null;
    currency: string;
    journal_entry_lines: Array<{
      account_id: string;
      debit_minor: bigint;
      credit_minor: bigint;
      currency: string;
      memo: string | null;
    }>;
  }): JournalEntry | null {
    const lines: JournalEntryLine[] = [];
    for (const l of row.journal_entry_lines) {
      const lineRes = JournalEntryLine.create(
        l.account_id,
        Money.fromMinor(l.debit_minor, l.currency as Currency),
        Money.fromMinor(l.credit_minor, l.currency as Currency),
        l.memo ?? undefined,
      );
      if (!lineRes.ok) {
        return null;
      }
      lines.push(lineRes.value);
    }

    const entryRes = JournalEntry.create({
      id: row.id,
      tenantId: row.tenant_id,
      entryNumber: row.entry_number,
      date: row.date,
      description: row.description,
      sourceType: row.source_type as JournalSourceType,
      sourceId: row.source_id ?? undefined,
      lines,
    });

    return entryRes.ok ? entryRes.value : null;
  }
}
