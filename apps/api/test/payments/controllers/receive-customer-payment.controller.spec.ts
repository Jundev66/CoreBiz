import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiveCustomerPaymentController } from '../../../src/modules/payments/controllers/receive-customer-payment.controller';
import { ReceivePaymentDtoMother } from '../mothers/receive-payment-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('ReceiveCustomerPaymentController', () => {
  let controller: ReceiveCustomerPaymentController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      receiveCustomerPayment: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000601',
          number: 'REC-000001',
          amount: '50.00',
          currency: 'USD',
        }),
      ),
    };

    controller = new ReceiveCustomerPaymentController(useCasesMock as UseCases);
  });

  it('delegates payment receipt to use case', async () => {
    const dto = ReceivePaymentDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000601',
      number: 'REC-000001',
      amount: '50.00',
      currency: 'USD',
    });
    expect(useCasesMock.receiveCustomerPayment).toHaveBeenCalledWith({
      customerId: dto.customerId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      reference: dto.reference,
      notes: dto.notes,
      allocations: dto.allocations.map((a) => ({
        deliveryNoteId: a.deliveryNoteId,
        amount: a.amount,
      })),
    });
  });
});
