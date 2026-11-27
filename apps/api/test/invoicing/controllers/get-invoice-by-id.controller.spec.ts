import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { GetInvoiceByIdController } from '../../../src/modules/invoicing/controllers/get-invoice-by-id.controller';
import { err, ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetInvoiceByIdController', () => {
  let controller: GetInvoiceByIdController;
  let useCasesMock: {
    getInvoiceById: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      getInvoiceById: {
        execute: vi.fn(),
      },
    };
    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;
    controller = new GetInvoiceByIdController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('returns invoice detail with ISO dates and lines', async () => {
    useCasesMock.getInvoiceById.execute.mockResolvedValue(
      ok({
        id: '018e245a-0000-7000-8000-000000000050',
        documentType: 'STANDARD',
        documentNumber: 'FAC-000001',
        controlNumber: null,
        customerId: '018e245a-0000-7000-8000-000000000010',
        issueDate: new Date('2026-04-01T12:00:00.000Z'),
        dueDate: new Date('2026-04-15T12:00:00.000Z'),
        currency: 'USD',
        paymentCondition: 'CREDIT',
        subtotalMinor: '10000',
        taxMinor: '1600',
        igtfMinor: '0',
        totalMinor: '11600',
        paidMinor: '5000',
        creditedMinor: '0',
        remainingBalanceMinor: '6600',
        status: 'PARTIALLY_PAID',
        lines: [
          {
            id: 'line-1',
            productId: null,
            description: 'Servicio Demo',
            quantity: '1.000',
            unitPriceMinor: '10000',
            taxPercentage: 16,
            subtotalMinor: '10000',
            taxMinor: '1600',
            totalMinor: '11600',
          },
        ],
      }),
    );

    const response = await controller.run('018e245a-0000-7000-8000-000000000050');

    expect(response.documentNumber).toBe('FAC-000001');
    expect(response.issueDate).toBe('2026-04-01T12:00:00.000Z');
    expect(response.lines).toHaveLength(1);
  });

  it('throws NotFoundException when invoice does not exist', async () => {
    useCasesMock.getInvoiceById.execute.mockResolvedValue(
      err({ kind: 'InvoiceNotFound', invoiceId: 'missing-id' }),
    );

    await expect(controller.run('missing-id')).rejects.toThrow(NotFoundException);
  });
});
