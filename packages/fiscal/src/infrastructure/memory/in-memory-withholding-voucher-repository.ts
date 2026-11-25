import type {
  WithholdingVoucher,
  WithholdingVoucherFilter,
  WithholdingVoucherRepository,
} from '../../domain';

export class InMemoryWithholdingVoucherRepository implements WithholdingVoucherRepository {
  private readonly storage = new Map<string, WithholdingVoucher>();
  private readonly periodCounters = new Map<string, number>();

  findById(tenantId: string, id: string): Promise<WithholdingVoucher | null> {
    const voucher = this.storage.get(id);
    if (!voucher || voucher.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(voucher);
  }

  findByNumber(tenantId: string, voucherNumber: string): Promise<WithholdingVoucher | null> {
    for (const voucher of this.storage.values()) {
      if (voucher.tenantId === tenantId && voucher.voucherNumber === voucherNumber) {
        return Promise.resolve(voucher);
      }
    }
    return Promise.resolve(null);
  }

  findBySourceDocument(
    tenantId: string,
    sourceDocumentId: string,
  ): Promise<readonly WithholdingVoucher[]> {
    const list: WithholdingVoucher[] = [];
    for (const voucher of this.storage.values()) {
      if (voucher.tenantId === tenantId && voucher.sourceDocumentId === sourceDocumentId) {
        list.push(voucher);
      }
    }
    return Promise.resolve(list);
  }

  list(
    tenantId: string,
    filter?: WithholdingVoucherFilter,
  ): Promise<readonly WithholdingVoucher[]> {
    const list: WithholdingVoucher[] = [];
    for (const voucher of this.storage.values()) {
      if (voucher.tenantId !== tenantId) {
        continue;
      }
      if (filter?.fiscalPeriod && voucher.fiscalPeriod !== filter.fiscalPeriod) {
        continue;
      }
      if (filter?.supplierTaxId && voucher.supplierTaxId !== filter.supplierTaxId) {
        continue;
      }
      if (filter?.status && voucher.status !== filter.status) {
        continue;
      }
      list.push(voucher);
    }

    list.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
    return Promise.resolve(list);
  }

  nextVoucherNumber(tenantId: string, fiscalPeriod: string): Promise<string> {
    const cleanPeriod = fiscalPeriod.replace(/[^0-9]/g, '').slice(0, 6);
    const key = `${tenantId}:${cleanPeriod}`;
    const nextSeq = (this.periodCounters.get(key) ?? 0) + 1;
    this.periodCounters.set(key, nextSeq);
    const padded = nextSeq.toString().padStart(8, '0');
    return Promise.resolve(`${cleanPeriod}${padded}`);
  }

  save(voucher: WithholdingVoucher): Promise<void> {
    this.storage.set(voucher.id, voucher);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.periodCounters.clear();
  }
}
