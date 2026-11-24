import { type PartnerDrawing, type PartnerDrawingRepository } from '../../domain/index';

export class ListPartnerDrawingsQueryHandler {
  constructor(private readonly partnerDrawingRepository: PartnerDrawingRepository) {}

  async execute(tenantId: string): Promise<readonly PartnerDrawing[]> {
    return this.partnerDrawingRepository.listByTenant(tenantId);
  }
}
