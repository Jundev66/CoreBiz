import { Quantity, ok, err, type Result } from '@corebiz/shared-kernel';
import {
  type PhysicalInventoryAuditError,
  type PhysicalInventoryAuditRepository,
} from '@corebiz/domain';

export interface AuditCountInput {
  readonly productId: string;
  readonly countedQuantity: string | number;
}

export interface RecordAuditCountsCommand {
  readonly tenantId: string;
  readonly auditId: string;
  readonly counts: readonly AuditCountInput[];
  readonly reviewedAt?: Date | undefined;
}

export type RecordAuditCountsError =
  | PhysicalInventoryAuditError
  | { readonly kind: 'AuditNotFound'; readonly auditId: string }
  | { readonly kind: 'InvalidQuantity'; readonly details: string };

export class RecordAuditCountsCommandHandler {
  constructor(private readonly auditRepo: PhysicalInventoryAuditRepository) {}

  async execute(command: RecordAuditCountsCommand): Promise<
    Result<
      {
        auditId: string;
        auditNumber: string;
        status: string;
        hasDiscrepancies: boolean;
      },
      RecordAuditCountsError
    >
  > {
    const audit = await this.auditRepo.findById(command.tenantId, command.auditId);
    if (!audit) {
      return err({ kind: 'AuditNotFound', auditId: command.auditId });
    }

    if (command.counts.length === 0) {
      return err({ kind: 'EmptyCounts' });
    }

    const parsedCounts: { productId: string; countedQuantity: Quantity }[] = [];
    for (const c of command.counts) {
      const qtyRes = Quantity.of(c.countedQuantity);
      if (!qtyRes.ok) {
        return err({
          kind: 'InvalidQuantity',
          details: `Invalid counted quantity for product ${c.productId}`,
        });
      }
      parsedCounts.push({
        productId: c.productId,
        countedQuantity: qtyRes.value,
      });
    }

    const recordRes = audit.recordCounts(parsedCounts, command.reviewedAt ?? new Date());
    if (!recordRes.ok) {
      return err(recordRes.error);
    }

    const updatedAudit = recordRes.value;
    await this.auditRepo.save(updatedAudit);

    return ok({
      auditId: updatedAudit.id,
      auditNumber: updatedAudit.auditNumber,
      status: updatedAudit.status,
      hasDiscrepancies: updatedAudit.hasDiscrepancies,
    });
  }
}
