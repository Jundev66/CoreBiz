import { ok, err, type Result } from '@corebiz/shared-kernel';
import {
  type PhysicalInventoryAuditError,
  type PhysicalInventoryAuditRepository,
} from '@corebiz/domain';

export interface CancelInventoryAuditCommand {
  readonly tenantId: string;
  readonly auditId: string;
  readonly reason: string;
  readonly cancelledAt?: Date | undefined;
}

export type CancelInventoryAuditError =
  PhysicalInventoryAuditError | { readonly kind: 'AuditNotFound'; readonly auditId: string };

export class CancelInventoryAuditCommandHandler {
  constructor(private readonly auditRepo: PhysicalInventoryAuditRepository) {}

  async execute(command: CancelInventoryAuditCommand): Promise<
    Result<
      {
        auditId: string;
        auditNumber: string;
        status: string;
      },
      CancelInventoryAuditError
    >
  > {
    const audit = await this.auditRepo.findById(command.tenantId, command.auditId);
    if (!audit) {
      return err({ kind: 'AuditNotFound', auditId: command.auditId });
    }

    const cancelRes = audit.cancel(command.reason, command.cancelledAt ?? new Date());
    if (!cancelRes.ok) {
      return err(cancelRes.error);
    }

    const cancelledAudit = cancelRes.value;
    await this.auditRepo.save(cancelledAudit);

    return ok({
      auditId: cancelledAudit.id,
      auditNumber: cancelledAudit.auditNumber,
      status: cancelledAudit.status,
    });
  }
}
