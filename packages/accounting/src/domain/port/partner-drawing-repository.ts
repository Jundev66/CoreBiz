import type { PartnerDrawing } from '../model/partner-drawing';

export interface PartnerDrawingRepository {
  findById(tenantId: string, id: string): Promise<PartnerDrawing | null>;
  nextDrawingNumber(tenantId: string): Promise<bigint>;
  save(drawing: PartnerDrawing): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly PartnerDrawing[]>;
}
