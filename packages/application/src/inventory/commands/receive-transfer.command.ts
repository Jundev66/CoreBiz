import { ok, err, type Result } from '@corebiz/shared-kernel';
import type { TransferError, WarehouseRepository, TransferRepository } from '@corebiz/domain';

export interface ReceiveTransferCommand {
  readonly tenantId: string;
  readonly transferId: string;
  readonly completedAt?: Date | undefined;
}

export type ReceiveTransferError =
  TransferError | { readonly kind: 'TransferNotFound'; readonly transferId: string };

export class ReceiveTransferCommandHandler {
  constructor(
    private readonly transferRepo: TransferRepository,
    private readonly warehouseRepo: WarehouseRepository,
  ) {}

  async execute(
    command: ReceiveTransferCommand,
  ): Promise<Result<{ transferId: string; status: string }, ReceiveTransferError>> {
    const transfer = await this.transferRepo.findById(command.tenantId, command.transferId);
    if (!transfer) {
      return err({ kind: 'TransferNotFound', transferId: command.transferId });
    }

    const completedAt = command.completedAt ?? new Date();
    const completeRes = transfer.complete(completedAt);
    if (!completeRes.ok) {
      return err(completeRes.error);
    }

    const completedTransfer = completeRes.value;

    for (const l of completedTransfer.lines) {
      await this.warehouseRepo.adjustStock(
        command.tenantId,
        completedTransfer.destinationWarehouseId,
        l.productId,
        l.quantity,
      );
    }

    await this.transferRepo.save(completedTransfer);

    return ok({
      transferId: completedTransfer.id,
      status: completedTransfer.status,
    });
  }
}
