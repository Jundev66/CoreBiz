import { Money, Quantity, ok, err, type Currency, type Result } from '@corebiz/shared-kernel';
import {
  AuditLine,
  PhysicalInventoryAudit,
  type PhysicalInventoryAuditError,
  type PhysicalInventoryAuditRepository,
  type WarehouseRepository,
} from '@corebiz/domain';

export interface AuditLineCreationInput {
  readonly productId: string;
  readonly theoreticalQuantity?: string | number | undefined;
  readonly unitCostMinor: string | bigint;
  readonly currency?: Currency | undefined;
}

export interface CreateInventoryAuditCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly warehouseId: string;
  readonly blindCount?: boolean | undefined;
  readonly notes?: string | undefined;
  readonly lines: readonly AuditLineCreationInput[];
}

export type CreateInventoryAuditError =
  | PhysicalInventoryAuditError
  | { readonly kind: 'WarehouseNotFound'; readonly warehouseId: string }
  | { readonly kind: 'InvalidQuantity'; readonly details: string };

export class CreateInventoryAuditCommandHandler {
  constructor(
    private readonly auditRepo: PhysicalInventoryAuditRepository,
    private readonly warehouseRepo: WarehouseRepository,
  ) {}

  async execute(command: CreateInventoryAuditCommand): Promise<
    Result<
      {
        auditId: string;
        auditNumber: string;
        status: string;
      },
      CreateInventoryAuditError
    >
  > {
    const warehouse = await this.warehouseRepo.findById(command.tenantId, command.warehouseId);
    if (!warehouse) {
      return err({
        kind: 'WarehouseNotFound',
        warehouseId: command.warehouseId,
      });
    }

    if (command.lines.length === 0) {
      return err({ kind: 'EmptyAuditLines' });
    }

    const domainLines: AuditLine[] = [];
    for (const line of command.lines) {
      let theoreticalQty: Quantity;
      if (line.theoreticalQuantity !== undefined) {
        const qtyRes = Quantity.of(line.theoreticalQuantity);
        if (!qtyRes.ok) {
          return err({
            kind: 'InvalidQuantity',
            details: `Invalid theoretical quantity for product ${line.productId}`,
          });
        }
        theoreticalQty = qtyRes.value;
      } else {
        theoreticalQty = await this.warehouseRepo.getStock(
          command.tenantId,
          command.warehouseId,
          line.productId,
        );
      }

      const unitCost = Money.fromMinor(BigInt(line.unitCostMinor), line.currency ?? 'USD');

      domainLines.push(new AuditLine(line.productId, theoreticalQty, null, unitCost));
    }

    const auditNumber = await this.auditRepo.nextAuditNumber(command.tenantId);

    const auditRes = PhysicalInventoryAudit.create({
      id: command.id,
      tenantId: command.tenantId,
      auditNumber,
      warehouseId: command.warehouseId,
      blindCount: command.blindCount,
      lines: domainLines,
      notes: command.notes,
      createdAt: new Date(),
    });

    if (!auditRes.ok) {
      return err(auditRes.error);
    }

    const audit = auditRes.value;
    await this.auditRepo.save(audit);

    return ok({
      auditId: audit.id,
      auditNumber: audit.auditNumber,
      status: audit.status,
    });
  }
}
