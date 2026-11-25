import 'server-only';
import { get } from './client';
import type { WithholdingVoucherResponse, FiscalSequenceRangeResponse } from '@corebiz/contracts';

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
