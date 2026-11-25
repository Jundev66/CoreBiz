import type { WithholdingVoucher } from '../model/withholding-voucher';

export interface WithholdingVoucherFilter {
  readonly fiscalPeriod?: string | undefined;
  readonly supplierTaxId?: string | undefined;
  readonly status?: string | undefined;
}

export interface WithholdingVoucherRepository {
  findById(tenantId: string, id: string): Promise<WithholdingVoucher | null>;
  findByNumber(tenantId: string, voucherNumber: string): Promise<WithholdingVoucher | null>;
  findBySourceDocument(
    tenantId: string,
    sourceDocumentId: string,
  ): Promise<readonly WithholdingVoucher[]>;
  list(tenantId: string, filter?: WithholdingVoucherFilter): Promise<readonly WithholdingVoucher[]>;
  nextVoucherNumber(tenantId: string, fiscalPeriod: string): Promise<string>;
  save(voucher: WithholdingVoucher): Promise<void>;
}
