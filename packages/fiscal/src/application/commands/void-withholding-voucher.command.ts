import { ok, err, type Result } from '@corebiz/shared-kernel';
import type { WithholdingError, WithholdingVoucherRepository } from '../../domain';

export interface VoidWithholdingVoucherCommand {
  readonly tenantId: string;
  readonly voucherId: string;
  readonly reason: string;
  readonly voidedAt?: Date | undefined;
}

export type VoidWithholdingVoucherError =
  WithholdingError | { readonly kind: 'WithholdingVoucherNotFound'; readonly voucherId: string };

export class VoidWithholdingVoucherCommandHandler {
  constructor(private readonly voucherRepo: WithholdingVoucherRepository) {}

  async execute(
    command: VoidWithholdingVoucherCommand,
  ): Promise<Result<{ voucherId: string; status: string }, VoidWithholdingVoucherError>> {
    const voucher = await this.voucherRepo.findById(command.tenantId, command.voucherId);
    if (!voucher) {
      return err({ kind: 'WithholdingVoucherNotFound', voucherId: command.voucherId });
    }

    const voidRes = voucher.void(command.reason, command.voidedAt);
    if (!voidRes.ok) {
      return err(voidRes.error);
    }

    await this.voucherRepo.save(voidRes.value);

    return ok({
      voucherId: voidRes.value.id,
      status: voidRes.value.status,
    });
  }
}
