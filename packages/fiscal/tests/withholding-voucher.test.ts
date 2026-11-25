import { describe, expect, it } from 'vitest';
import { Money } from '@corebiz/shared-kernel';
import { WithholdingVoucher, computeWithheldAmount } from '../src/domain/model/withholding-voucher';
import { InMemoryWithholdingVoucherRepository } from '../src/infrastructure/memory/in-memory-withholding-voucher-repository';
import { IssueWithholdingVoucherCommandHandler } from '../src/application/commands/issue-withholding-voucher.command';
import { VoidWithholdingVoucherCommandHandler } from '../src/application/commands/void-withholding-voucher.command';
import { ListWithholdingVouchersQueryHandler } from '../src/application/queries/list-withholding-vouchers.query';

describe('Statutory Fiscal Withholdings Engine (SENIAT IVA/ISLR & US 1099)', () => {
  it('computes exact 75% SENIAT IVA withholding on purchases without penny drift', () => {
    const base = Money.fromMinor(10000n, 'VES');
    const tax = Money.fromMinor(1600n, 'VES');
    const withheld = computeWithheldAmount('IVA_75', base, tax, 7500);

    expect(withheld.minorUnits).toBe(1200n);
    expect(withheld.currency).toBe('VES');
  });

  it('computes exact 100% SENIAT IVA withholding when provider is non-compliant', () => {
    const base = Money.fromMinor(25000n, 'VES');
    const tax = Money.fromMinor(4000n, 'VES');
    const withheld = computeWithheldAmount('IVA_100', base, tax, 10000);

    expect(withheld.minorUnits).toBe(4000n);
    expect(withheld.currency).toBe('VES');
  });

  it('computes exact ISLR withholding on services based on taxable base', () => {
    const base = Money.fromMinor(50000n, 'VES');
    const tax = Money.fromMinor(8000n, 'VES');
    const withheld = computeWithheldAmount('ISLR', base, tax, 200);

    expect(withheld.minorUnits).toBe(1000n);
    expect(withheld.currency).toBe('VES');
  });

  it('computes US 1099 backup withholding of 24% on taxable base', () => {
    const base = Money.fromMinor(100000n, 'USD');
    const tax = Money.fromMinor(0n, 'USD');
    const withheld = computeWithheldAmount('US_1099_BACKUP', base, tax, 2400);

    expect(withheld.minorUnits).toBe(24000n);
    expect(withheld.currency).toBe('USD');
  });

  it('issues a SENIAT withholding voucher with consecutive 14-digit numbering per period', async () => {
    const repo = new InMemoryWithholdingVoucherRepository();
    const handler = new IssueWithholdingVoucherCommandHandler(repo);

    const res1 = await handler.execute({
      id: 'vouch-1',
      tenantId: 'tenant-ve-special',
      sourceDocumentId: 'rec-001',
      documentNumber: 'FACT-000492',
      controlNumber: '00-00000492',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Distribuidora Central C.A.',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    expect(res1.value.voucherNumber).toBe('20261100000001');
    expect(res1.value.withheldAmountMinor).toBe('1200');
    expect(res1.value.status).toBe('ISSUED');

    const res2 = await handler.execute({
      id: 'vouch-2',
      tenantId: 'tenant-ve-special',
      sourceDocumentId: 'rec-002',
      documentNumber: 'FACT-000493',
      supplierTaxId: 'J-98765432-1',
      supplierName: 'Comercializadora Andina S.A.',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 20000n,
      taxAmountMinor: 3200n,
      percentageBp: 7500,
      currency: 'VES',
    });

    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    expect(res2.value.voucherNumber).toBe('20261100000002');
    expect(res2.value.withheldAmountMinor).toBe('2400');
  });

  it('transitions voucher to DECLARED when presented to tax administration', () => {
    const base = Money.fromMinor(10000n, 'VES');
    const tax = Money.fromMinor(1600n, 'VES');

    const voucherRes = WithholdingVoucher.create({
      id: 'v-1',
      tenantId: 'tenant-1',
      voucherNumber: '20261100000001',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      sourceDocumentId: 'rec-1',
      documentNumber: 'F-100',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Proveedor 1',
      taxableBase: base,
      taxAmount: tax,
      percentageBp: 7500,
    });

    expect(voucherRes.ok).toBe(true);
    if (!voucherRes.ok) return;

    const voucher = voucherRes.value;
    expect(voucher.status).toBe('ISSUED');

    const declaredDate = new Date('2026-11-20T10:00:00Z');
    const declaredRes = voucher.declare(declaredDate);

    expect(declaredRes.ok).toBe(true);
    if (!declaredRes.ok) return;

    expect(declaredRes.value.status).toBe('DECLARED');
    expect(declaredRes.value.declaredAt).toEqual(declaredDate);
  });

  it('voids a withholding voucher with mandatory reason', async () => {
    const repo = new InMemoryWithholdingVoucherRepository();
    const issueHandler = new IssueWithholdingVoucherCommandHandler(repo);
    const voidHandler = new VoidWithholdingVoucherCommandHandler(repo);

    await issueHandler.execute({
      id: 'v-voidable',
      tenantId: 'tenant-1',
      sourceDocumentId: 'rec-1',
      documentNumber: 'F-100',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Proveedor 1',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    const voidRes = await voidHandler.execute({
      tenantId: 'tenant-1',
      voucherId: 'v-voidable',
      reason: 'Invoice was cancelled by supplier due to incorrect fiscal RIF',
    });

    expect(voidRes.ok).toBe(true);
    if (!voidRes.ok) return;

    expect(voidRes.value.status).toBe('VOID');

    const stored = await repo.findById('tenant-1', 'v-voidable');
    expect(stored?.status).toBe('VOID');
    expect(stored?.voidReason).toBe(
      'Invoice was cancelled by supplier due to incorrect fiscal RIF',
    );
  });

  it('rejects voiding an already voided voucher or without reason', async () => {
    const repo = new InMemoryWithholdingVoucherRepository();
    const issueHandler = new IssueWithholdingVoucherCommandHandler(repo);
    const voidHandler = new VoidWithholdingVoucherCommandHandler(repo);

    await issueHandler.execute({
      id: 'v-twice',
      tenantId: 'tenant-1',
      sourceDocumentId: 'rec-1',
      documentNumber: 'F-100',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Proveedor 1',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    const noReasonRes = await voidHandler.execute({
      tenantId: 'tenant-1',
      voucherId: 'v-twice',
      reason: '   ',
    });

    expect(noReasonRes.ok).toBe(false);
    if (noReasonRes.ok) return;
    expect(noReasonRes.error.kind).toBe('VoidReasonRequired');

    await voidHandler.execute({
      tenantId: 'tenant-1',
      voucherId: 'v-twice',
      reason: 'Valid first void',
    });

    const secondVoidRes = await voidHandler.execute({
      tenantId: 'tenant-1',
      voucherId: 'v-twice',
      reason: 'Cannot void twice',
    });

    expect(secondVoidRes.ok).toBe(false);
    if (secondVoidRes.ok) return;
    expect(secondVoidRes.error.kind).toBe('VoucherAlreadyFinalized');
  });

  it('filters vouchers by fiscal period and preserves strict multi-tenant boundary', async () => {
    const repo = new InMemoryWithholdingVoucherRepository();
    const issueHandler = new IssueWithholdingVoucherCommandHandler(repo);
    const queryHandler = new ListWithholdingVouchersQueryHandler(repo);

    await issueHandler.execute({
      id: 'v-t1-p1',
      tenantId: 'tenant-alpha',
      sourceDocumentId: 'rec-1',
      documentNumber: 'F-1',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Prov A',
      fiscalPeriod: '2026-10',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    await issueHandler.execute({
      id: 'v-t1-p2',
      tenantId: 'tenant-alpha',
      sourceDocumentId: 'rec-2',
      documentNumber: 'F-2',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Prov A',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    await issueHandler.execute({
      id: 'v-t2-p2',
      tenantId: 'tenant-beta',
      sourceDocumentId: 'rec-3',
      documentNumber: 'F-3',
      supplierTaxId: 'J-12345678-9',
      supplierName: 'Prov A',
      fiscalPeriod: '2026-11',
      withholdingType: 'IVA_75',
      taxableBaseMinor: 10000n,
      taxAmountMinor: 1600n,
      percentageBp: 7500,
      currency: 'VES',
    });

    const allAlpha = await queryHandler.execute({ tenantId: 'tenant-alpha' });
    expect(allAlpha.length).toBe(2);

    const novAlpha = await queryHandler.execute({
      tenantId: 'tenant-alpha',
      filter: { fiscalPeriod: '2026-11' },
    });
    expect(novAlpha.length).toBe(1);
    expect(novAlpha[0]?.id).toBe('v-t1-p2');

    const beta = await queryHandler.execute({ tenantId: 'tenant-beta' });
    expect(beta.length).toBe(1);
    expect(beta[0]?.id).toBe('v-t2-p2');
  });
});
