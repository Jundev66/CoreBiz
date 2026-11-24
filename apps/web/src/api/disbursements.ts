import 'server-only';
import { get, send } from './client';
import type { RecordDisbursementDto, DisbursementResponseDto } from '@corebiz/contracts';

export async function listDisbursements(): Promise<readonly DisbursementResponseDto[]> {
  try {
    return await get<readonly DisbursementResponseDto[]>('/v1/accounting/disbursements');
  } catch {
    return [];
  }
}

export async function recordDisbursement(data: RecordDisbursementDto) {
  return send<DisbursementResponseDto>('POST', '/v1/accounting/disbursements', data);
}
