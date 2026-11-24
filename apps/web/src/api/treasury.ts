import 'server-only';
import { get, send } from './client';
import type { ExecuteTreasurySwapDto, TreasurySwapResponseDto } from '@corebiz/contracts';

export async function listTreasurySwaps(): Promise<readonly TreasurySwapResponseDto[]> {
  try {
    return await get<readonly TreasurySwapResponseDto[]>('/v1/accounting/treasury/swaps');
  } catch {
    return [];
  }
}

export async function executeTreasurySwap(data: ExecuteTreasurySwapDto) {
  return send<TreasurySwapResponseDto>('POST', '/v1/accounting/treasury/swaps', data);
}
