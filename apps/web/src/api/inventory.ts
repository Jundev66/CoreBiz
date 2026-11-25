import 'server-only';
import { get } from './client';
import type {
  WarehouseResponse,
  TransferResponse,
  InventoryAuditResponse,
} from '@corebiz/contracts';
import type { InventoryAuditDetails } from '@corebiz/application';

export async function listWarehouses(): Promise<readonly WarehouseResponse[]> {
  const res = await get<{ warehouses: readonly WarehouseResponse[] }>('/v1/inventory/warehouses');
  return res?.warehouses ?? [];
}

export async function listTransfers(): Promise<readonly TransferResponse[]> {
  const res = await get<{ transfers: readonly TransferResponse[] }>('/v1/inventory/transfers');
  return res?.transfers ?? [];
}

export async function listInventoryAudits(
  warehouseId?: string,
): Promise<readonly InventoryAuditResponse[]> {
  const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  const res = await get<readonly InventoryAuditResponse[]>(`/v1/inventory/audits${query}`);
  return res ?? [];
}

export async function getInventoryAuditDetails(
  id: string,
  maskBlind?: boolean,
): Promise<InventoryAuditDetails | null> {
  const query = maskBlind !== undefined ? `?maskBlind=${maskBlind}` : '';
  return get<InventoryAuditDetails>(`/v1/inventory/audits/${id}${query}`);
}
