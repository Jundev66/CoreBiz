import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayGoodsReceiptController } from '../../../src/modules/purchasing/controllers/pay-goods-receipt.controller';
import { err, ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('PayGoodsReceiptController', () => {
  let controller: PayGoodsReceiptController;
  let useCasesMock: {
    payGoodsReceipt: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    useCasesMock = {
      payGoodsReceipt: vi.fn(),
    };
    controller = new PayGoodsReceiptController(useCasesMock as unknown as UseCases);
  });

  it('delegates supplier payment to use case and returns updated balances', async () => {
    useCasesMock.payGoodsReceipt.mockResolvedValue(
      ok({
        receiptId: '018e245a-0000-7000-8000-000000000501',
        journalEntryId: '018e245a-0000-7000-8000-000000000601',
        paidMinor: '5000',
        remainingBalanceMinor: '5000',
      }),
    );

    const response = await controller.run('018e245a-0000-7000-8000-000000000501', {
      amount: '50.00',
      currency: 'USD',
      paymentDate: new Date('2026-04-01T12:00:00.000Z'),
      sourceAccountId: '018e245a-0000-7000-8000-000000000104',
      reference: 'USDT-TX-001',
    });

    expect(response).toEqual({
      receiptId: '018e245a-0000-7000-8000-000000000501',
      journalEntryId: '018e245a-0000-7000-8000-000000000601',
      paidMinor: '5000',
      remainingBalanceMinor: '5000',
    });
    expect(useCasesMock.payGoodsReceipt).toHaveBeenCalledWith({
      receiptId: '018e245a-0000-7000-8000-000000000501',
      amountMinor: 5000n,
      currency: 'USD',
      paymentDate: new Date('2026-04-01T12:00:00.000Z'),
      sourceAccountId: '018e245a-0000-7000-8000-000000000104',
      reference: 'USDT-TX-001',
    });
  });

  it('throws NotFoundException when receipt does not exist', async () => {
    useCasesMock.payGoodsReceipt.mockResolvedValue(
      err({ kind: 'GoodsReceiptNotFound', receiptId: 'missing' }),
    );

    await expect(
      controller.run('missing', {
        amount: '10.00',
        currency: 'USD',
        paymentDate: new Date('2026-04-01T12:00:00.000Z'),
        sourceAccountId: '018e245a-0000-7000-8000-000000000104',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when source account is invalid', async () => {
    useCasesMock.payGoodsReceipt.mockResolvedValue(err({ kind: 'InvalidSourceAccount' }));

    await expect(
      controller.run('018e245a-0000-7000-8000-000000000501', {
        amount: '10.00',
        currency: 'USD',
        paymentDate: new Date('2026-04-01T12:00:00.000Z'),
        sourceAccountId: '018e245a-0000-7000-8000-000000000999',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
