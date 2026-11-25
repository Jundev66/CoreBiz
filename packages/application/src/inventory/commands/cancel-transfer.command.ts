import { ok, err, type Result } from '@corebiz/shared-kernel';
import type { TransferError, WarehouseRepository, TransferRepository } from '@corebiz/domain';

export interface CancelTransferCommand {
  readonly tenantId: string;
  readonly transferId: string;
  readonly reason: string;
  readonly cancelledAt?: Date | undefined;
}

export type CancelTransferError =
  TransferError | { readonly kind: 'TransferNotFound'; readonly transferId: string };

export class CancelTransferCommandHandler {
  constructor(
    private readonly transferRepo: TransferRepository,
    private readonly warehouseRepo: WarehouseRepository,
  ) {}

  async execute(
    command: CancelTransferCommand,
  ): Promise<Result<{ transferId: string; status: string }, CancelTransferError>> {
    const transfer = await this.transferRepo.findById(command.tenantId, command.transferId);
    if (!transfer) {
      return err({ kind: 'TransferNotFound', transferId: command.transferId });
    }

    const cancelledAt = command.cancelledAt ?? new Date();
    const cancelRes = transfer.cancel(command.reason, cancelledAt);
    if (!cancelRes.ok) {
      return err(cancelRes.error);
    }

    const cancelledTransfer = cancelRes.value;

    if (transfer.status === 'IN_TRANSIT') {
      for (const l of transfer.lines) {
        await this.warehouseRepo.adjustStock(
          command.tenantId,
          transfer.sourceWarehouseId,
          l.productId,
          l.quantity,
        );
      }
    }

    await this.transferRepo.save(cancelledTransfer);

    return ok({
      transferId: cancelledTransfer.id,
      status: cancelledTransfer.status,
    });
  }
}
