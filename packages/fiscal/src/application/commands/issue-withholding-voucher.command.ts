import { Money, ok, err, type Currency, type Result } from '@corebiz/shared-kernel';
import {
  WithholdingVoucher,
  type WithholdingType,
  type WithholdingError,
  type WithholdingVoucherRepository,
} from '../../domain';

export interface IssueWithholdingVoucherCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceDocumentId: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly fiscalPeriod: string;
  readonly withholdingType: WithholdingType;
  readonly taxableBaseMinor: bigint;
  readonly taxAmountMinor: bigint;
  readonly percentageBp: number;
  readonly currency: Currency;
  readonly issuedAt?: Date | undefined;
}

export type IssueWithholdingVoucherError =
  WithholdingError | { readonly kind: 'VoucherCreationFailed'; readonly details: string };

export class IssueWithholdingVoucherCommandHandler {
  constructor(private readonly voucherRepo: WithholdingVoucherRepository) {}

  async execute(command: IssueWithholdingVoucherCommand): Promise<
    Result<
      {
        voucherId: string;
        voucherNumber: string;
        withheldAmountMinor: string;
        status: string;
      },
      IssueWithholdingVoucherError
    >
  > {
    const voucherNumber = await this.voucherRepo.nextVoucherNumber(
      command.tenantId,
      command.fiscalPeriod,
    );

    const taxableBase = Money.fromMinor(command.taxableBaseMinor, command.currency);
    const taxAmount = Money.fromMinor(command.taxAmountMinor, command.currency);

    const voucherRes = WithholdingVoucher.create({
      id: command.id,
      tenantId: command.tenantId,
      voucherNumber,
      fiscalPeriod: command.fiscalPeriod,
      withholdingType: command.withholdingType,
      sourceDocumentId: command.sourceDocumentId,
      documentNumber: command.documentNumber,
      controlNumber: command.controlNumber,
      supplierTaxId: command.supplierTaxId,
      supplierName: command.supplierName,
      taxableBase,
      taxAmount,
      percentageBp: command.percentageBp,
      issuedAt: command.issuedAt,
    });

    if (!voucherRes.ok) {
      return err(voucherRes.error);
    }

    const voucher = voucherRes.value;
    await this.voucherRepo.save(voucher);

    return ok({
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber,
      withheldAmountMinor: voucher.withheldAmount.minorUnits.toString(),
      status: voucher.status,
    });
  }
}
