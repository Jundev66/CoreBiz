import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueInvoiceController } from '../../../src/modules/invoicing/controllers/issue-invoice.controller';
import { IssueInvoiceDtoMother } from '../mothers/issue-invoice-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('IssueInvoiceController', () => {
  let controller: IssueInvoiceController;
  let useCasesMock: {
    issueInvoice: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      issueInvoice: {
        execute: vi.fn().mockResolvedValue(
          ok({
            invoiceId: '018e245a-0000-7000-8000-000000000050',
            journalEntryId: '018e245a-0000-7000-8000-000000000051',
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new IssueInvoiceController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('delegates invoice issuance and returns invoiceId and journalEntryId', async () => {
    const dto = IssueInvoiceDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      invoiceId: '018e245a-0000-7000-8000-000000000050',
      journalEntryId: '018e245a-0000-7000-8000-000000000051',
    });
    expect(useCasesMock.issueInvoice.execute).toHaveBeenCalled();
  });
});
