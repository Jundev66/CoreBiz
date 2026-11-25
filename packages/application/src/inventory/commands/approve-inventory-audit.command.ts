import { Money, ok, err, type Result } from '@corebiz/shared-kernel';
import { JournalEntry, JournalEntryLine, type JournalEntryRepository } from '@corebiz/accounting';
import {
  type PhysicalInventoryAuditError,
  type PhysicalInventoryAuditRepository,
  type WarehouseRepository,
} from '@corebiz/domain';

export interface ApproveInventoryAuditCommand {
  readonly tenantId: string;
  readonly auditId: string;
  readonly notes?: string | undefined;
  readonly shrinkageExpenseAccountId?: string | undefined;
  readonly inventoryAssetAccountId?: string | undefined;
  readonly surplusIncomeAccountId?: string | undefined;
  readonly approvedAt?: Date | undefined;
}

export type ApproveInventoryAuditError =
  | PhysicalInventoryAuditError
  | { readonly kind: 'AuditNotFound'; readonly auditId: string }
  | { readonly kind: 'JournalEntryError'; readonly details: string };

export class ApproveInventoryAuditCommandHandler {
  constructor(
    private readonly auditRepo: PhysicalInventoryAuditRepository,
    private readonly warehouseRepo: WarehouseRepository,
    private readonly journalEntryRepo?: JournalEntryRepository | undefined,
  ) {}

  async execute(command: ApproveInventoryAuditCommand): Promise<
    Result<
      {
        auditId: string;
        auditNumber: string;
        status: string;
        journalEntryId?: string | undefined;
      },
      ApproveInventoryAuditError
    >
  > {
    const audit = await this.auditRepo.findById(command.tenantId, command.auditId);
    if (!audit) {
      return err({ kind: 'AuditNotFound', auditId: command.auditId });
    }

    if (audit.status !== 'IN_REVIEW') {
      return err({
        kind: 'AuditNotReadyForApproval',
        currentStatus: audit.status,
      });
    }

    for (const line of audit.lines) {
      if (!line.discrepancyQuantity.isZero) {
        await this.warehouseRepo.adjustStock(
          command.tenantId,
          audit.warehouseId,
          line.productId,
          line.discrepancyQuantity,
        );
      }
    }

    let createdJournalEntryId: string | undefined;

    if (this.journalEntryRepo && audit.hasDiscrepancies) {
      const shrinkageAccountId = command.shrinkageExpenseAccountId ?? '6.1.05';
      const inventoryAccountId = command.inventoryAssetAccountId ?? '1.1.03';
      const surplusAccountId = command.surplusIncomeAccountId ?? '4.1.03';
      const currency = audit.currency;
      const journalLines: JournalEntryLine[] = [];

      const shortageValue = audit.totalShortageValue;
      if (shortageValue.isPositive) {
        const debitShrinkage = JournalEntryLine.create(
          shrinkageAccountId,
          shortageValue,
          Money.zero(currency),
          `Inventory Shrinkage Expense - Audit ${audit.auditNumber}`,
        );
        if (!debitShrinkage.ok) {
          return err({
            kind: 'JournalEntryError',
            details: 'Failed to create shrinkage debit line',
          });
        }
        journalLines.push(debitShrinkage.value);

        const creditInventory = JournalEntryLine.create(
          inventoryAccountId,
          Money.zero(currency),
          shortageValue,
          `Inventory Asset Reduction - Audit ${audit.auditNumber}`,
        );
        if (!creditInventory.ok) {
          return err({
            kind: 'JournalEntryError',
            details: 'Failed to create inventory reduction credit line',
          });
        }
        journalLines.push(creditInventory.value);
      }

      const surplusValue = audit.totalSurplusValue;
      if (surplusValue.isPositive) {
        const debitInventory = JournalEntryLine.create(
          inventoryAccountId,
          surplusValue,
          Money.zero(currency),
          `Inventory Asset Surplus - Audit ${audit.auditNumber}`,
        );
        if (!debitInventory.ok) {
          return err({
            kind: 'JournalEntryError',
            details: 'Failed to create inventory surplus debit line',
          });
        }
        journalLines.push(debitInventory.value);

        const creditSurplus = JournalEntryLine.create(
          surplusAccountId,
          Money.zero(currency),
          surplusValue,
          `Inventory Surplus Income - Audit ${audit.auditNumber}`,
        );
        if (!creditSurplus.ok) {
          return err({
            kind: 'JournalEntryError',
            details: 'Failed to create surplus income credit line',
          });
        }
        journalLines.push(creditSurplus.value);
      }

      if (journalLines.length > 0) {
        const entryNumber = await this.journalEntryRepo.nextEntryNumber(command.tenantId);
        const journalRes = JournalEntry.create({
          id: `${audit.id}-journal`,
          tenantId: command.tenantId,
          entryNumber,
          date: command.approvedAt ?? new Date(),
          description: `Inventory Physical Count Adjustment - Audit ${audit.auditNumber}`,
          sourceType: 'ADJUSTMENT',
          sourceId: audit.id,
          lines: journalLines,
        });

        if (!journalRes.ok) {
          return err({
            kind: 'JournalEntryError',
            details: `Failed to create journal entry: ${journalRes.error.kind}`,
          });
        }

        await this.journalEntryRepo.save(journalRes.value);
        createdJournalEntryId = journalRes.value.id;
      }
    }

    const approveRes = audit.approve(createdJournalEntryId, command.approvedAt ?? new Date());
    if (!approveRes.ok) {
      return err(approveRes.error);
    }

    const approvedAudit = approveRes.value;
    await this.auditRepo.save(approvedAudit);

    return ok({
      auditId: approvedAudit.id,
      auditNumber: approvedAudit.auditNumber,
      status: approvedAudit.status,
      journalEntryId: createdJournalEntryId,
    });
  }
}
