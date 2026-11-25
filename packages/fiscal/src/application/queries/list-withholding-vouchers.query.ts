import type {
  WithholdingVoucher,
  WithholdingVoucherFilter,
  WithholdingVoucherRepository,
} from '../../domain';

export interface ListWithholdingVouchersQuery {
  readonly tenantId: string;
  readonly filter?: WithholdingVoucherFilter | undefined;
}

export class ListWithholdingVouchersQueryHandler {
  constructor(private readonly voucherRepo: WithholdingVoucherRepository) {}

  async execute(query: ListWithholdingVouchersQuery): Promise<readonly WithholdingVoucher[]> {
    return this.voucherRepo.list(query.tenantId, query.filter);
  }
}
