import type { PhysicalInventoryAuditRepository } from '@corebiz/domain';

export interface ListInventoryAuditsQuery {
  readonly tenantId: string;
  readonly warehouseId?: string | undefined;
}

export interface InventoryAuditSummary {
  readonly id: string;
  readonly auditNumber: string;
  readonly warehouseId: string;
  readonly blindCount: boolean;
  readonly status: string;
  readonly notes?: string | undefined;
  readonly linesCount: number;
  readonly hasDiscrepancies: boolean;
  readonly createdAt: string;
  readonly reviewedAt?: string | undefined;
  readonly approvedAt?: string | undefined;
  readonly cancelledAt?: string | undefined;
  readonly cancelReason?: string | undefined;
  readonly journalEntryId?: string | undefined;
}

export class ListInventoryAuditsQueryHandler {
  constructor(private readonly auditRepo: PhysicalInventoryAuditRepository) {}

  async execute(query: ListInventoryAuditsQuery): Promise<readonly InventoryAuditSummary[]> {
    const audits = await this.auditRepo.listByTenant(query.tenantId, query.warehouseId);

    return audits.map((a) => ({
      id: a.id,
      auditNumber: a.auditNumber,
      warehouseId: a.warehouseId,
      blindCount: a.blindCount,
      status: a.status,
      notes: a.notes,
      linesCount: a.lines.length,
      hasDiscrepancies: a.hasDiscrepancies,
      createdAt: a.createdAt.toISOString(),
      reviewedAt: a.reviewedAt?.toISOString(),
      approvedAt: a.approvedAt?.toISOString(),
      cancelledAt: a.cancelledAt?.toISOString(),
      cancelReason: a.cancelReason,
      journalEntryId: a.journalEntryId,
    }));
  }
}
