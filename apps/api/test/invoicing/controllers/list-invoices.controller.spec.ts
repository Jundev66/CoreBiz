import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListInvoicesController } from '../../../src/modules/invoicing/controllers/list-invoices.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('ListInvoicesController', () => {
  let controller: ListInvoicesController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    listInvoices: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok([
        {
          id: 'inv-1',
          documentType: 'FACTURA',
          documentNumber: 'FAC-0001',
          controlNumber: '00-00000001',
          customerId: 'cust-1',
          issueDate: new Date('2026-11-23T10:00:00.000Z'),
          dueDate: new Date('2026-11-30T10:00:00.000Z'),
          currency: 'USD',
          subtotalMinor: '10000',
          taxMinor: '1600',
          igtfMinor: '0',
          totalMinor: '11600',
          paidMinor: '0',
          status: 'ISSUED',
        },
      ]),
    );

    useCasesMock = {
      listInvoices: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new ListInvoicesController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('lists tenant invoices and returns mapped response', async () => {
    const response = await controller.run({});

    expect(response.invoices).toHaveLength(1);
    expect(response.invoices[0]?.documentNumber).toBe('FAC-0001');
    expect(response.invoices[0]?.controlNumber).toBe('00-00000001');
    expect(response.invoices[0]?.totalMinor).toBe('11600');
    expect(executeSpy).toHaveBeenCalledWith({
      tenantId: '018e245a-0000-7000-8000-000000000001',
    });
  });
});
