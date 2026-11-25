import { Quantity, ok, err, type Result } from '@corebiz/shared-kernel';
import {
  InterWarehouseTransfer,
  type TransferError,
  type WarehouseRepository,
  type TransferRepository,
} from '@corebiz/domain';

export interface TransferLineCreationInput {
  readonly productId: string;
  readonly quantity: number | string;
}

export interface InitiateTransferCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceWarehouseId: string;
  readonly destinationWarehouseId: string;
  readonly notes?: string | undefined;
  readonly lines: readonly TransferLineCreationInput[];
  readonly initiatedAt?: Date | undefined;
}

export type InitiateTransferError =
  | TransferError
  | { readonly kind: 'SourceWarehouseNotFound'; readonly warehouseId: string }
  | { readonly kind: 'DestinationWarehouseNotFound'; readonly warehouseId: string }
  | { readonly kind: 'SourceWarehouseInactive'; readonly warehouseId: string }
  | { readonly kind: 'DestinationWarehouseInactive'; readonly warehouseId: string };

export class InitiateTransferCommandHandler {
  constructor(
    private readonly transferRepo: TransferRepository,
    private readonly warehouseRepo: WarehouseRepository,
  ) {}

  async execute(
    command: InitiateTransferCommand,
  ): Promise<
    Result<{ transferId: string; transferNumber: string; status: string }, InitiateTransferError>
  > {
    if (command.sourceWarehouseId === command.destinationWarehouseId) {
      return err({ kind: 'SameSourceAndDestination' });
    }

    const sourceWh = await this.warehouseRepo.findById(command.tenantId, command.sourceWarehouseId);
    if (!sourceWh) {
      return err({
        kind: 'SourceWarehouseNotFound',
        warehouseId: command.sourceWarehouseId,
      });
    }
    if (!sourceWh.isActive) {
      return err({
        kind: 'SourceWarehouseInactive',
        warehouseId: command.sourceWarehouseId,
      });
    }

    const destWh = await this.warehouseRepo.findById(
      command.tenantId,
      command.destinationWarehouseId,
    );
    if (!destWh) {
      return err({
        kind: 'DestinationWarehouseNotFound',
        warehouseId: command.destinationWarehouseId,
      });
    }
    if (!destWh.isActive) {
      return err({
        kind: 'DestinationWarehouseInactive',
        warehouseId: command.destinationWarehouseId,
      });
    }

    if (command.lines.length === 0) {
      return err({ kind: 'EmptyTransferLines' });
    }

    const domainLines: { productId: string; quantity: Quantity }[] = [];

    for (const l of command.lines) {
      const qtyRes = Quantity.of(l.quantity);
      if (!qtyRes.ok) {
        return err({
          kind: 'InvalidTransferLineQuantity',
          details: `Invalid quantity format: ${l.quantity}`,
        });
      }
      const qty = qtyRes.value;
      if (!qty.isPositive) {
        return err({
          kind: 'InvalidTransferLineQuantity',
          details: `Quantity must be positive for product ${l.productId}`,
        });
      }

      const availableStock = await this.warehouseRepo.getStock(
        command.tenantId,
        command.sourceWarehouseId,
        l.productId,
      );

      if (availableStock.scaledValue < qty.scaledValue) {
        return err({
          kind: 'InsufficientWarehouseStock',
          details: `Product ${l.productId} available: ${availableStock.toString()}, requested: ${qty.toString()}`,
        });
      }

      domainLines.push({ productId: l.productId, quantity: qty });
    }

    for (const l of domainLines) {
      const negQty = Quantity.fromScaled(-l.quantity.scaledValue);
      await this.warehouseRepo.adjustStock(
        command.tenantId,
        command.sourceWarehouseId,
        l.productId,
        negQty,
      );
    }

    const transferNumber = await this.transferRepo.nextTransferNumber(command.tenantId);
    const initiatedAt = command.initiatedAt ?? new Date();

    const transferRes = InterWarehouseTransfer.create({
      id: command.id,
      tenantId: command.tenantId,
      transferNumber,
      sourceWarehouseId: command.sourceWarehouseId,
      destinationWarehouseId: command.destinationWarehouseId,
      lines: domainLines,
      notes: command.notes,
      status: 'DRAFT',
    });

    if (!transferRes.ok) {
      return err(transferRes.error);
    }

    const inTransitRes = transferRes.value.initiate(initiatedAt);
    if (!inTransitRes.ok) {
      return err(inTransitRes.error);
    }

    const transfer = inTransitRes.value;
    await this.transferRepo.save(transfer);

    return ok({
      transferId: transfer.id,
      transferNumber: transfer.transferNumber,
      status: transfer.status,
    });
  }
}
