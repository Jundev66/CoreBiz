import 'server-only';
import { get, send } from './client';
import type {
  WithholdingVoucherResponse,
  FiscalSequenceRangeResponse,
  TaxRateConfigResponse,
  CreateTaxRateConfigInput,
} from '@corebiz/contracts';

export async function listWithholdingVouchers(
  entityId?: string,
): Promise<readonly WithholdingVoucherResponse[]> {
  const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : '';
  const res = await get<{ vouchers: readonly WithholdingVoucherResponse[] }>(
    `/v1/fiscal/withholdings${query}`,
  );
  return res?.vouchers ?? [];
}

export async function listFiscalSequenceRanges(): Promise<readonly FiscalSequenceRangeResponse[]> {
  const res = await get<{ ranges: readonly FiscalSequenceRangeResponse[] }>(
    '/v1/fiscal/sequences/ranges',
  );
  return res?.ranges ?? [];
}

export async function listTaxRateConfigs(): Promise<readonly TaxRateConfigResponse[]> {
  const res = await get<{ taxRates: readonly TaxRateConfigResponse[] }>('/v1/fiscal/tax-rates');
  return res?.taxRates ?? [];
}

export async function createTaxRateConfig(input: CreateTaxRateConfigInput) {
  return send<TaxRateConfigResponse>('POST', '/v1/fiscal/tax-rates', input);
}

export async function setDefaultTaxRateConfig(id: string) {
  return send<{ updated: boolean; id: string }>(
    'PATCH',
    `/v1/fiscal/tax-rates/${encodeURIComponent(id)}/default`,
    {},
  );
}
