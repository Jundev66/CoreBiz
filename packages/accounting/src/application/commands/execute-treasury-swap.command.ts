import { type Currency, type Result, ok, err, Money } from '@corebiz/shared-kernel';
import {
  type AccountRepository,
  type JournalEntryRepository,
  type TreasurySwapRepository,
  JournalEntry,
  JournalEntryLine,
  TreasurySwap,
} from '../../domain/index';

export interface ExecuteTreasurySwapCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly sourceAccountId: string;
  readonly sourceCurrency: Currency;
  readonly sourceAmountMinor: bigint;
  readonly targetAccountId: string;
  readonly targetCurrency: Currency;
  readonly targetAmountMinor: bigint;
  readonly feeAccountId: string;
  readonly feeAmountMinor: bigint;
  readonly exchangeRateScaled: bigint;
  readonly counterpartyReference: string;
  readonly operatorUserId: string;
  readonly description?: string | undefined;
  readonly validateAvailableBalance?: boolean | undefined;
}

export interface ExecuteTreasurySwapResult {
  readonly swap: TreasurySwap;
  readonly journalEntry: JournalEntry;
}

export interface ExecuteTreasurySwapError {
  readonly kind:
    | 'SourceAccountNotFound'
    | 'TargetAccountNotFound'
    | 'FeeAccountNotFound'
    | 'SourceAccountNotAsset'
    | 'TargetAccountNotAsset'
    | 'FeeAccountNotExpense'
    | 'IdenticalAccounts'
    | 'InvalidAmount'
    | 'InvalidExchangeRate'
    | 'InsufficientFunds'
    | 'JournalEntryError'
    | 'SwapValidationError';
  readonly details?: string | undefined;
}

const SCALE_FACTOR = 100_000_000n;

export class ExecuteTreasurySwapCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly treasurySwapRepository: TreasurySwapRepository,
  ) {}

  async execute(
    command: ExecuteTreasurySwapCommand,
  ): Promise<Result<ExecuteTreasurySwapResult, ExecuteTreasurySwapError>> {
    if (command.sourceAccountId === command.targetAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (command.sourceAmountMinor <= 0n || command.targetAmountMinor <= 0n) {
      return err({ kind: 'InvalidAmount', details: 'Amounts must be positive' });
    }

    if (command.feeAmountMinor < 0n) {
      return err({ kind: 'InvalidAmount', details: 'Fee cannot be negative' });
    }

    if (command.exchangeRateScaled <= 0n) {
      return err({ kind: 'InvalidExchangeRate' });
    }

    const sourceAccount = await this.accountRepository.findById(
      command.tenantId,
      command.sourceAccountId,
    );
    if (!sourceAccount) {
      return err({ kind: 'SourceAccountNotFound' });
    }
    if (sourceAccount.category !== 'ASSET') {
      return err({ kind: 'SourceAccountNotAsset' });
    }

    if (command.validateAvailableBalance) {
      const entries = await this.journalEntryRepository.listByDateRange(
        command.tenantId,
        new Date('2000-01-01T00:00:00Z'),
        new Date('2099-12-31T23:59:59Z'),
      );
      let availableMinor = 0n;
      for (const entry of entries) {
        if (entry.currency !== command.sourceCurrency) continue;
        for (const line of entry.lines) {
          if (line.accountId === command.sourceAccountId) {
            availableMinor += line.debit.minorUnits - line.credit.minorUnits;
          }
        }
      }
      if (availableMinor < command.sourceAmountMinor) {
        return err({
          kind: 'InsufficientFunds',
          details: `Available ${(Number(availableMinor) / 100).toFixed(2)} ${command.sourceCurrency}, required ${(Number(command.sourceAmountMinor) / 100).toFixed(2)} ${command.sourceCurrency}`,
        });
      }
    }

    const targetAccount = await this.accountRepository.findById(
      command.tenantId,
      command.targetAccountId,
    );
    if (!targetAccount) {
      return err({ kind: 'TargetAccountNotFound' });
    }
    if (targetAccount.category !== 'ASSET') {
      return err({ kind: 'TargetAccountNotAsset' });
    }

    const feeAccount = await this.accountRepository.findById(
      command.tenantId,
      command.feeAccountId,
    );
    if (!feeAccount) {
      return err({ kind: 'FeeAccountNotFound' });
    }
    if (feeAccount.category !== 'EXPENSE' && feeAccount.category !== 'COGS') {
      return err({ kind: 'FeeAccountNotExpense' });
    }

    const journalCurrency = command.sourceCurrency;
    let feeInJournalCurrencyMinor = 0n;

    if (command.feeAmountMinor > 0n) {
      if (command.sourceCurrency === command.targetCurrency) {
        feeInJournalCurrencyMinor = command.feeAmountMinor;
      } else if (command.sourceCurrency === 'VES' && command.targetCurrency === 'USD') {
        feeInJournalCurrencyMinor =
          (command.feeAmountMinor * command.exchangeRateScaled) / SCALE_FACTOR;
      } else if (command.sourceCurrency === 'USD' && command.targetCurrency === 'VES') {
        feeInJournalCurrencyMinor = command.feeAmountMinor;
      } else {
        feeInJournalCurrencyMinor = command.feeAmountMinor;
      }
    }

    if (feeInJournalCurrencyMinor >= command.sourceAmountMinor) {
      return err({ kind: 'InvalidAmount', details: 'Fee exceeds total source amount' });
    }

    const targetDebitMinor = command.sourceAmountMinor - feeInJournalCurrencyMinor;
    const nextEntryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const nextSwapNumber = await this.treasurySwapRepository.nextSwapNumber(command.tenantId);

    const zero = Money.zero(journalCurrency);
    const targetDebit = Money.fromMinor(targetDebitMinor, journalCurrency);
    const sourceCredit = Money.fromMinor(command.sourceAmountMinor, journalCurrency);

    const targetLineResult = JournalEntryLine.create(
      command.targetAccountId,
      targetDebit,
      zero,
      `Swap target: ${command.targetCurrency}`,
    );
    if (!targetLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: targetLineResult.error.kind });
    }

    const journalLines: JournalEntryLine[] = [targetLineResult.value];

    if (feeInJournalCurrencyMinor > 0n) {
      const feeDebit = Money.fromMinor(feeInJournalCurrencyMinor, journalCurrency);
      const feeLineResult = JournalEntryLine.create(
        command.feeAccountId,
        feeDebit,
        zero,
        `Swap fee: Ref ${command.counterpartyReference}`,
      );
      if (!feeLineResult.ok) {
        return err({ kind: 'JournalEntryError', details: feeLineResult.error.kind });
      }
      journalLines.push(feeLineResult.value);
    }

    const sourceLineResult = JournalEntryLine.create(
      command.sourceAccountId,
      zero,
      sourceCredit,
      `Swap source: ${command.sourceCurrency}`,
    );
    if (!sourceLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: sourceLineResult.error.kind });
    }
    journalLines.push(sourceLineResult.value);

    const journalResult = JournalEntry.create({
      id: crypto.randomUUID(),
      tenantId: command.tenantId,
      entryNumber: nextEntryNumber,
      date: command.date,
      description:
        command.description ??
        `Treasury swap #${nextSwapNumber}: ${command.sourceCurrency} -> ${command.targetCurrency} (Ref: ${command.counterpartyReference})`,
      sourceType: 'TREASURY_SWAP',
      sourceId: command.id,
      lines: journalLines,
    });

    if (!journalResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalResult.error.kind });
    }

    const swapResult = TreasurySwap.create({
      id: command.id,
      tenantId: command.tenantId,
      swapNumber: nextSwapNumber,
      date: command.date,
      sourceAccountId: command.sourceAccountId,
      sourceCurrency: command.sourceCurrency,
      sourceAmount: Money.fromMinor(command.sourceAmountMinor, command.sourceCurrency),
      targetAccountId: command.targetAccountId,
      targetCurrency: command.targetCurrency,
      targetAmount: Money.fromMinor(command.targetAmountMinor, command.targetCurrency),
      feeAccountId: command.feeAccountId,
      feeAmount: Money.fromMinor(command.feeAmountMinor, command.targetCurrency),
      exchangeRateScaled: command.exchangeRateScaled,
      counterpartyReference: command.counterpartyReference,
      operatorUserId: command.operatorUserId,
      description:
        command.description ??
        `Treasury swap #${nextSwapNumber}: ${command.sourceCurrency} -> ${command.targetCurrency}`,
      journalEntryId: journalResult.value.id,
      status: 'COMPLETED',
      createdAt: new Date(),
    });

    if (!swapResult.ok) {
      return err({ kind: 'SwapValidationError', details: swapResult.error.kind });
    }

    await this.journalEntryRepository.save(journalResult.value);
    await this.treasurySwapRepository.save(swapResult.value);

    return ok({
      swap: swapResult.value,
      journalEntry: journalResult.value,
    });
  }
}
