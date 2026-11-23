import {
  type Currency,
  type AccountRepository,
  type JournalEntryRepository,
  ok,
  type Result,
} from '../../domain/index';

export interface GetTrialBalanceQuery {
  readonly tenantId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly currency: Currency;
}

export interface TrialBalanceAccountItem {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly normalSide: string;
  readonly totalDebitMinor: bigint;
  readonly totalCreditMinor: bigint;
  readonly netBalanceMinor: bigint;
}

export interface TrialBalanceResponse {
  readonly accounts: readonly TrialBalanceAccountItem[];
  readonly totalDebitMinor: bigint;
  readonly totalCreditMinor: bigint;
  readonly isBalanced: boolean;
}

export class GetTrialBalanceQueryHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(query: GetTrialBalanceQuery): Promise<Result<TrialBalanceResponse, never>> {
    const accounts = await this.accountRepository.listByTenant(query.tenantId);
    const entries = await this.journalEntryRepository.listByDateRange(
      query.tenantId,
      query.startDate,
      query.endDate,
    );

    const debitSums = new Map<string, bigint>();
    const creditSums = new Map<string, bigint>();

    for (const entry of entries) {
      if (entry.currency === query.currency) {
        for (const line of entry.lines) {
          const currentDebit = debitSums.get(line.accountId) ?? 0n;
          const currentCredit = creditSums.get(line.accountId) ?? 0n;
          debitSums.set(line.accountId, currentDebit + line.debit.minorUnits);
          creditSums.set(line.accountId, currentCredit + line.credit.minorUnits);
        }
      }
    }

    let overallDebitMinor = 0n;
    let overallCreditMinor = 0n;

    const items: TrialBalanceAccountItem[] = [];

    for (const account of accounts) {
      const debit = debitSums.get(account.id) ?? 0n;
      const credit = creditSums.get(account.id) ?? 0n;

      overallDebitMinor += debit;
      overallCreditMinor += credit;

      const netBalance = account.normalSide === 'DEBIT' ? debit - credit : credit - debit;

      items.push({
        accountId: account.id,
        code: account.code.value,
        name: account.name,
        normalSide: account.normalSide,
        totalDebitMinor: debit,
        totalCreditMinor: credit,
        netBalanceMinor: netBalance,
      });
    }

    return ok({
      accounts: items,
      totalDebitMinor: overallDebitMinor,
      totalCreditMinor: overallCreditMinor,
      isBalanced: overallDebitMinor === overallCreditMinor,
    });
  }
}
