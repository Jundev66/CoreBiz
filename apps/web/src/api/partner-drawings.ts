import 'server-only';
import { get, send } from './client';
import type {
  RecordPartnerCashDrawingDto,
  RecordPartnerStockDrawingDto,
  PartnerDrawingResponseDto,
} from '@corebiz/contracts';

export async function listPartnerDrawings(): Promise<readonly PartnerDrawingResponseDto[]> {
  try {
    return await get<readonly PartnerDrawingResponseDto[]>('/v1/accounting/drawings');
  } catch {
    return [];
  }
}

export async function recordPartnerCashDrawing(data: RecordPartnerCashDrawingDto) {
  return send<PartnerDrawingResponseDto>('POST', '/v1/accounting/drawings/cash', data);
}

export async function recordPartnerStockDrawing(data: RecordPartnerStockDrawingDto) {
  return send<PartnerDrawingResponseDto>('POST', '/v1/accounting/drawings/stock', data);
}
