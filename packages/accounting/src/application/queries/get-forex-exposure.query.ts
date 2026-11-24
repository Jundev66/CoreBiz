import {
  type AccountRepository,
  type JournalEntryRepository,
  Money,
  ExchangeRate,
  type Currency,
  ok,
  type Result,
} from '../../domain/index';
import { MonetaryPosition } from '../../domain/model/monetary-position';

export interface GetForexExposureQuery {
  readonly tenantId: string;
  readonly functionalCurrency: Currency;
  readonly foreignCurrency: Currency;
  readonly currentRateScaled: bigint;
  readonly closingRateScaled: bigint;
}

export interface MonetaryPositionExposureItem {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly positionType: 'ASSET' | 'LIABILITY';
  readonly foreignAmount: string;
  readonly historicalBookValue: string;
  readonly revaluedMarketValue: string;
  readonly unrealizedDelta: string;
  readonly isGain: boolean;
}

export interface ForexExposureSummary {
  readonly functionalCurrency: Currency;
  readonly foreignCurrency: Currency;
  readonly totalForeignAmount: string;
  readonly totalUnrealizedGain: string;
  readonly totalUnrealizedLoss: string;
  readonly netUnrealized: string;
  readonly positions: readonly MonetaryPositionExposureItem[];
}

export class GetForexExposureQueryHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
  ) {}

  async execute(query: GetForexExposureQuery): Promise<Result<ForexExposureSummary, never>> {
    const accounts = await this.accountRepository.listByTenant(query.tenantId);
    const targetAccounts = accounts.filter(
      (a) =>
        a.isActive && a.isReconcilable && (a.category === 'ASSET' || a.category === 'LIABILITY'),
    );

    const journalEntries = await this.journalEntryRepository.listByDateRange(
      query.tenantId,
      new Date('1970-01-01'),
      new Date(),
    );

    const positions: MonetaryPositionExposureItem[] = [];
    let totalForeignMinor = 0n;
    let totalGainMinor = 0n;
    let totalLossMinor = 0n;

    const historicalRate = ExchangeRate.fromScaled(
      query.currentRateScaled,
      query.foreignCurrency,
      query.functionalCurrency,
      new Date(),
    );
    const closingRate = ExchangeRate.fromScaled(
      query.closingRateScaled,
      query.foreignCurrency,
      query.functionalCurrency,
      new Date(),
    );

    for (const acc of targetAccounts) {
      let balanceMinor = 0n;
      for (const entry of journalEntries) {
        if (entry.currency === query.foreignCurrency) {
          for (const line of entry.lines) {
            if (line.accountId === acc.id) {
              if (acc.category === 'ASSET') {
                balanceMinor += line.debit.minorUnits - line.credit.minorUnits;
              } else {
                balanceMinor += line.credit.minorUnits - line.debit.minorUnits;
              }
            }
          }
        }
      }

      if (balanceMinor <= 0n) {
        continue;
      }

      const foreignMoney = Money.fromMinor(balanceMinor, query.foreignCurrency);
      const posResult = MonetaryPosition.create({
        accountId: acc.id,
        accountCode: acc.code.value,
        accountName: acc.name,
        positionType: acc.category === 'ASSET' ? 'ASSET' : 'LIABILITY',
        foreignAmount: foreignMoney,
        historicalRate,
        closingRate,
      });

      if (!posResult.ok) {
        continue;
      }

      const pos = posResult.value;
      const adj = pos.calculateForexAdjustment();

      totalForeignMinor += balanceMinor;
      if (adj.isGain) {
        totalGainMinor += adj.adjustmentAmount.minorUnits;
      } else {
        totalLossMinor += adj.adjustmentAmount.minorUnits;
      }

      positions.push({
        accountId: acc.id,
        accountCode: acc.code.value,
        accountName: acc.name,
        positionType: acc.category === 'ASSET' ? 'ASSET' : 'LIABILITY',
        foreignAmount: foreignMoney.toString(),
        historicalBookValue: pos.calculateHistoricalBookValue().toString(),
        revaluedMarketValue: pos.calculateRevaluedMarketValue().toString(),
        unrealizedDelta: adj.adjustmentAmount.toString(),
        isGain: adj.isGain,
      });
    }

    const netMinor = totalGainMinor - totalLossMinor;

    return ok({
      functionalCurrency: query.functionalCurrency,
      foreignCurrency: query.foreignCurrency,
      totalForeignAmount: Money.fromMinor(totalForeignMinor, query.foreignCurrency).toString(),
      totalUnrealizedGain: Money.fromMinor(totalGainMinor, query.functionalCurrency).toString(),
      totalUnrealizedLoss: Money.fromMinor(totalLossMinor, query.functionalCurrency).toString(),
      netUnrealized: Money.fromMinor(netMinor, query.functionalCurrency).toString(),
      positions,
    });
  }
}
