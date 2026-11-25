import { Money, ok, err, type Result } from '@corebiz/shared-kernel';

export type WithholdingType = 'IVA_75' | 'IVA_100' | 'ISLR' | 'US_1099_BACKUP';
export type WithholdingStatus = 'ISSUED' | 'DECLARED' | 'VOID';

export interface WithholdingVoucherProps {
  readonly id: string;
  readonly tenantId: string;
  readonly voucherNumber: string;
  readonly fiscalPeriod: string;
  readonly withholdingType: WithholdingType;
  readonly sourceDocumentId: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly taxableBase: Money;
  readonly taxAmount: Money;
  readonly percentageBp: number;
  readonly withheldAmount?: Money | undefined;
  readonly status?: WithholdingStatus | undefined;
  readonly issuedAt?: Date | undefined;
  readonly declaredAt?: Date | undefined;
  readonly voidedAt?: Date | undefined;
  readonly voidReason?: string | undefined;
}

export interface WithholdingError {
  readonly kind:
    | 'InvalidVoucherNumber'
    | 'InvalidFiscalPeriod'
    | 'InvalidPercentageBp'
    | 'CurrencyMismatch'
    | 'NegativeWithholdingAmount'
    | 'VoucherAlreadyFinalized'
    | 'InvalidStatusTransition'
    | 'VoidReasonRequired';
  readonly details?: string | undefined;
}

export function computeWithheldAmount(
  withholdingType: WithholdingType,
  taxableBase: Money,
  taxAmount: Money,
  percentageBp: number,
): Money {
  const baseUnits =
    withholdingType === 'IVA_75' || withholdingType === 'IVA_100'
      ? taxAmount.minorUnits
      : taxableBase.minorUnits;

  const calculatedMinor = (baseUnits * BigInt(percentageBp)) / 10000n;
  return Money.fromMinor(calculatedMinor, taxableBase.currency);
}

export class WithholdingVoucher {
  readonly id: string;
  readonly tenantId: string;
  readonly voucherNumber: string;
  readonly fiscalPeriod: string;
  readonly withholdingType: WithholdingType;
  readonly sourceDocumentId: string;
  readonly documentNumber: string;
  readonly controlNumber?: string | undefined;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly taxableBase: Money;
  readonly taxAmount: Money;
  readonly percentageBp: number;
  readonly withheldAmount: Money;
  readonly status: WithholdingStatus;
  readonly issuedAt: Date;
  readonly declaredAt?: Date | undefined;
  readonly voidedAt?: Date | undefined;
  readonly voidReason?: string | undefined;

  private constructor(
    props: WithholdingVoucherProps,
    withheldAmount: Money,
    status: WithholdingStatus,
    issuedAt: Date,
  ) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.voucherNumber = props.voucherNumber;
    this.fiscalPeriod = props.fiscalPeriod;
    this.withholdingType = props.withholdingType;
    this.sourceDocumentId = props.sourceDocumentId;
    this.documentNumber = props.documentNumber;
    this.controlNumber = props.controlNumber;
    this.supplierTaxId = props.supplierTaxId;
    this.supplierName = props.supplierName;
    this.taxableBase = props.taxableBase;
    this.taxAmount = props.taxAmount;
    this.percentageBp = props.percentageBp;
    this.withheldAmount = withheldAmount;
    this.status = status;
    this.issuedAt = issuedAt;
    this.declaredAt = props.declaredAt;
    this.voidedAt = props.voidedAt;
    this.voidReason = props.voidReason;
  }

  static create(props: WithholdingVoucherProps): Result<WithholdingVoucher, WithholdingError> {
    if (!props.voucherNumber || props.voucherNumber.trim().length === 0) {
      return err({ kind: 'InvalidVoucherNumber', details: 'Voucher number cannot be empty' });
    }

    if (!props.fiscalPeriod || props.fiscalPeriod.trim().length === 0) {
      return err({ kind: 'InvalidFiscalPeriod', details: 'Fiscal period cannot be empty' });
    }

    if (props.percentageBp <= 0 || props.percentageBp > 10000) {
      return err({
        kind: 'InvalidPercentageBp',
        details: 'Percentage must be between 1 and 10000 bp',
      });
    }

    if (props.taxableBase.currency !== props.taxAmount.currency) {
      return err({
        kind: 'CurrencyMismatch',
        details: 'Taxable base and tax amount currencies must match',
      });
    }

    const withheld =
      props.withheldAmount ??
      computeWithheldAmount(
        props.withholdingType,
        props.taxableBase,
        props.taxAmount,
        props.percentageBp,
      );

    if (withheld.currency !== props.taxableBase.currency) {
      return err({
        kind: 'CurrencyMismatch',
        details: 'Withheld amount currency must match base currency',
      });
    }

    if (withheld.minorUnits < 0n) {
      return err({
        kind: 'NegativeWithholdingAmount',
        details: 'Withheld amount cannot be negative',
      });
    }

    const status = props.status ?? 'ISSUED';
    const issuedAt = props.issuedAt ?? new Date();

    return ok(new WithholdingVoucher(props, withheld, status, issuedAt));
  }

  declare(declaredAt: Date = new Date()): Result<WithholdingVoucher, WithholdingError> {
    if (this.status !== 'ISSUED') {
      return err({
        kind: 'InvalidStatusTransition',
        details: `Cannot declare voucher with status ${this.status}`,
      });
    }

    return ok(
      new WithholdingVoucher(
        {
          id: this.id,
          tenantId: this.tenantId,
          voucherNumber: this.voucherNumber,
          fiscalPeriod: this.fiscalPeriod,
          withholdingType: this.withholdingType,
          sourceDocumentId: this.sourceDocumentId,
          documentNumber: this.documentNumber,
          controlNumber: this.controlNumber,
          supplierTaxId: this.supplierTaxId,
          supplierName: this.supplierName,
          taxableBase: this.taxableBase,
          taxAmount: this.taxAmount,
          percentageBp: this.percentageBp,
          withheldAmount: this.withheldAmount,
          status: 'DECLARED',
          issuedAt: this.issuedAt,
          declaredAt,
          voidedAt: this.voidedAt,
          voidReason: this.voidReason,
        },
        this.withheldAmount,
        'DECLARED',
        this.issuedAt,
      ),
    );
  }

  void(reason: string, voidedAt: Date = new Date()): Result<WithholdingVoucher, WithholdingError> {
    if (this.status === 'VOID') {
      return err({
        kind: 'VoucherAlreadyFinalized',
        details: 'Voucher is already voided',
      });
    }

    if (!reason || reason.trim().length === 0) {
      return err({
        kind: 'VoidReasonRequired',
        details: 'A valid reason is required to void a withholding voucher',
      });
    }

    return ok(
      new WithholdingVoucher(
        {
          id: this.id,
          tenantId: this.tenantId,
          voucherNumber: this.voucherNumber,
          fiscalPeriod: this.fiscalPeriod,
          withholdingType: this.withholdingType,
          sourceDocumentId: this.sourceDocumentId,
          documentNumber: this.documentNumber,
          controlNumber: this.controlNumber,
          supplierTaxId: this.supplierTaxId,
          supplierName: this.supplierName,
          taxableBase: this.taxableBase,
          taxAmount: this.taxAmount,
          percentageBp: this.percentageBp,
          withheldAmount: this.withheldAmount,
          status: 'VOID',
          issuedAt: this.issuedAt,
          declaredAt: this.declaredAt,
          voidedAt,
          voidReason: reason.trim(),
        },
        this.withheldAmount,
        'VOID',
        this.issuedAt,
      ),
    );
  }
}
