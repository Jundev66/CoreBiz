import 'server-only';
import { get, send } from './client';
import type { GetForexExposureQueryDto, RunForexRevaluationDto } from '@corebiz/contracts';

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

export interface ForexExposureApiResponse {
  readonly functionalCurrency: string;
  readonly foreignCurrency: string;
  readonly totalForeignAmount: string;
  readonly totalUnrealizedGain: string;
  readonly totalUnrealizedLoss: string;
  readonly netUnrealized: string;
  readonly positions: readonly MonetaryPositionExposureItem[];
}

export async function getForexExposure(
  query: GetForexExposureQueryDto,
): Promise<ForexExposureApiResponse> {
  const params = new URLSearchParams({
    functionalCurrency: query.functionalCurrency,
    foreignCurrency: query.foreignCurrency,
    currentRate: query.currentRate,
    closingRate: query.closingRate,
  });

  return get<ForexExposureApiResponse>(`/v1/accounting/forex/exposure?${params.toString()}`);
}

export async function runForexRevaluation(data: RunForexRevaluationDto) {
  return send<{
    entryId: string;
    entryNumber: string;
    totalGain: string;
    totalLoss: string;
    netDelta: string;
  }>('POST', '/v1/accounting/forex/revaluate', data);
}
