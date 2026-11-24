import {
  type AccountRepository,
  type JournalEntryRepository,
  JournalEntry,
  JournalEntryLine,
  Money,
  ExchangeRate,
  type Currency,
  ok,
  err,
  type Result,
} from '../../domain/index';
import { MonetaryPosition, type MonetaryPositionType } from '../../domain/model/monetary-position';

export interface ForexPositionInput {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly positionType: MonetaryPositionType;
  readonly foreignCurrency: Currency;
  readonly foreignAmountMinor: bigint;
  readonly historicalRateScaled: bigint;
  readonly closingRateScaled: bigint;
}

export interface RunForexRevaluationCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly revaluationDate: Date;
  readonly functionalCurrency: Currency;
  readonly positions: readonly ForexPositionInput[];
  readonly gainAccountId: string;
  readonly lossAccountId: string;
  readonly description?: string | undefined;
}

export interface RunForexRevaluationError {
  readonly kind:
    | 'EmptyPositions'
    | 'GainAccountNotFound'
    | 'LossAccountNotFound'
    | 'AccountNotFound'
    | 'InvalidJournalLine'
    | 'UnbalancedJournalEntry';
  readonly details?: string | undefined;
}

export class RunForexRevaluationCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(command: RunForexRevaluationCommand): Promise<
    Result<
      {
        entryId: string;
        entryNumber: bigint;
        totalGainMinor: bigint;
        totalLossMinor: bigint;
        netDeltaMinor: bigint;
      },
      RunForexRevaluationError
    >
  > {
    if (command.positions.length === 0) {
      return err({ kind: 'EmptyPositions' });
    }

    const gainAccount = await this.accountRepository.findById(
      command.tenantId,
      command.gainAccountId,
    );
    if (!gainAccount) {
      return err({ kind: 'GainAccountNotFound', details: command.gainAccountId });
    }

    const lossAccount = await this.accountRepository.findById(
      command.tenantId,
      command.lossAccountId,
    );
    if (!lossAccount) {
      return err({ kind: 'LossAccountNotFound', details: command.lossAccountId });
    }

    const zero = Money.fromMinor(0n, command.functionalCurrency);
    const domainLines: JournalEntryLine[] = [];

    let totalGainMinor = 0n;
    let totalLossMinor = 0n;

    for (const input of command.positions) {
      if (input.foreignAmountMinor === 0n) {
        continue;
      }

      const account = await this.accountRepository.findById(command.tenantId, input.accountId);
      if (!account) {
        return err({ kind: 'AccountNotFound', details: input.accountId });
      }

      const foreignMoney = Money.fromMinor(input.foreignAmountMinor, input.foreignCurrency);
      const historicalRate = ExchangeRate.fromScaled(
        input.historicalRateScaled,
        input.foreignCurrency,
        command.functionalCurrency,
        command.revaluationDate,
      );
      const closingRate = ExchangeRate.fromScaled(
        input.closingRateScaled,
        input.foreignCurrency,
        command.functionalCurrency,
        command.revaluationDate,
      );

      const posResult = MonetaryPosition.create({
        accountId: input.accountId,
        accountCode: input.accountCode,
        accountName: input.accountName,
        positionType: input.positionType,
        foreignAmount: foreignMoney,
        historicalRate,
        closingRate,
      });

      if (!posResult.ok) {
        continue;
      }

      const pos = posResult.value;
      const adj = pos.calculateForexAdjustment();
      if (adj.adjustmentAmount.isZero) {
        continue;
      }

      const memo = `Forex Revaluation: ${input.accountCode} (${input.foreignCurrency})`;

      if (adj.isGain) {
        totalGainMinor += adj.adjustmentAmount.minorUnits;

        const assetDebit = JournalEntryLine.create(
          input.accountId,
          adj.adjustmentAmount,
          zero,
          memo,
        );
        const gainCredit = JournalEntryLine.create(
          command.gainAccountId,
          zero,
          adj.adjustmentAmount,
          memo,
        );

        if (!assetDebit.ok || !gainCredit.ok) {
          return err({ kind: 'InvalidJournalLine' });
        }
        domainLines.push(assetDebit.value, gainCredit.value);
      } else {
        totalLossMinor += adj.adjustmentAmount.minorUnits;

        const lossDebit = JournalEntryLine.create(
          command.lossAccountId,
          adj.adjustmentAmount,
          zero,
          memo,
        );
        const assetCredit = JournalEntryLine.create(
          input.accountId,
          zero,
          adj.adjustmentAmount,
          memo,
        );

        if (!lossDebit.ok || !assetCredit.ok) {
          return err({ kind: 'InvalidJournalLine' });
        }
        domainLines.push(lossDebit.value, assetCredit.value);
      }
    }

    if (domainLines.length === 0) {
      return ok({
        entryId: '',
        entryNumber: 0n,
        totalGainMinor: 0n,
        totalLossMinor: 0n,
        netDeltaMinor: 0n,
      });
    }

    const nextNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);

    const entryResult = JournalEntry.create({
      id: command.id,
      tenantId: command.tenantId,
      entryNumber: nextNumber,
      date: command.revaluationDate,
      description:
        command.description ??
        `Period-end forex revaluation (${command.functionalCurrency}) at closing rates`,
      sourceType: 'ADJUSTMENT',
      lines: domainLines,
    });

    if (!entryResult.ok) {
      return err({ kind: 'UnbalancedJournalEntry' });
    }

    await this.journalEntryRepository.save(entryResult.value);

    return ok({
      entryId: entryResult.value.id,
      entryNumber: nextNumber,
      totalGainMinor,
      totalLossMinor,
      netDeltaMinor: totalGainMinor - totalLossMinor,
    });
  }
}
