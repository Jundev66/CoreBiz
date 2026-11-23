import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplyPaymentController } from '../../../src/modules/invoicing/controllers/apply-payment.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('ApplyPaymentController', () => {
  let controller: ApplyPaymentController;
  let useCasesMock: {
    applyInvoicePayment: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      applyInvoicePayment: {
        execute: vi.fn().mockResolvedValue(
          ok({
            invoiceId: '018e245a-0000-7000-8000-000000000050',
            remainingBalanceMinor: 5000n,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new ApplyPaymentController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('records payment against invoice and returns stringified remaining balance', async () => {
    const response = await controller.run('018e245a-0000-7000-8000-000000000050', {
      invoiceId: '018e245a-0000-7000-8000-000000000050',
      amount: '50.00',
      currency: 'USD',
      paymentDate: new Date('2026-04-01T12:00:00.000Z'),
      cashAccountId: '018e245a-0000-7000-8000-000000000010',
      receivableAccountId: '018e245a-0000-7000-8000-000000000020',
      reference: 'PAGO-001',
    });

    expect(response).toEqual({
      invoiceId: '018e245a-0000-7000-8000-000000000050',
      remainingBalanceMinor: '5000',
    });
    expect(useCasesMock.applyInvoicePayment.execute).toHaveBeenCalled();
  });
});
