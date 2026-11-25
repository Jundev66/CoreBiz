import { ok, err, type Result } from '@corebiz/shared-kernel';
import type { PhysicalInventoryAuditRepository } from '@corebiz/domain';

export interface GetInventoryAuditDetailsQuery {
  readonly tenantId: string;
  readonly auditId: string;
  readonly maskBlind?: boolean | undefined;
}

export interface InventoryAuditLineDetails {
  readonly productId: string;
  readonly theoreticalQuantity: string | null;
  readonly countedQuantity: string | null;
  readonly discrepancyQuantity: string | null;
  readonly unitCostMinor: string;
  readonly discrepancyMonetaryValueMinor: string | null;
  readonly currency: string;
}

export interface InventoryAuditDetails {
  readonly id: string;
  readonly auditNumber: string;
  readonly warehouseId: string;
  readonly blindCount: boolean;
  readonly status: string;
  readonly notes: string | null;
  readonly lines: readonly InventoryAuditLineDetails[];
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly approvedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly journalEntryId: string | null;
}

export class GetInventoryAuditDetailsQueryHandler {
  constructor(private readonly auditRepo: PhysicalInventoryAuditRepository) {}

  async execute(
    query: GetInventoryAuditDetailsQuery,
  ): Promise<
    Result<InventoryAuditDetails, { readonly kind: 'AuditNotFound'; readonly auditId: string }>
  > {
    const audit = await this.auditRepo.findById(query.tenantId, query.auditId);
    if (!audit) {
      return err({ kind: 'AuditNotFound', auditId: query.auditId });
    }

    const shouldMask = audit.blindCount && (query.maskBlind ?? audit.status === 'OPEN');

    const lines: InventoryAuditLineDetails[] = audit.lines.map((l) => ({
      productId: l.productId,
      theoreticalQuantity: shouldMask ? null : l.theoreticalQuantity.toString(),
      countedQuantity: l.countedQuantity ? l.countedQuantity.toString() : null,
      discrepancyQuantity: shouldMask ? null : l.discrepancyQuantity.toString(),
      unitCostMinor: l.unitCost.minorUnits.toString(),
      discrepancyMonetaryValueMinor: shouldMask
        ? null
        : l.discrepancyMonetaryValue.minorUnits.toString(),
      currency: l.unitCost.currency,
    }));

    return ok({
      id: audit.id,
      auditNumber: audit.auditNumber,
      warehouseId: audit.warehouseId,
      blindCount: audit.blindCount,
      status: audit.status,
      notes: audit.notes ?? null,
      lines,
      createdAt: audit.createdAt.toISOString(),
      reviewedAt: audit.reviewedAt?.toISOString() ?? null,
      approvedAt: audit.approvedAt?.toISOString() ?? null,
      cancelledAt: audit.cancelledAt?.toISOString() ?? null,
      cancelReason: audit.cancelReason ?? null,
      journalEntryId: audit.journalEntryId ?? null,
    });
  }
}
