import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetSalesBookController } from '../../../src/modules/fiscal/controllers/get-sales-book.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { Runtime } from '../../../src/composition/runtime.provider';
import type { TenantContext } from '@corebiz/application';

describe('GetSalesBookController', () => {
  let controller: GetSalesBookController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    generateSalesBook: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok({
        records: [
          {
            operationNumber: 1,
            issueDate: new Date('2026-11-15T10:00:00.000Z'),
            customerTaxId: 'J-12345678-9',
            customerName: 'Cliente Demo C.A.',
            documentNumber: 'FACT-0001',
            controlNumber: '00-00000001',
            affectedDocumentNumber: null,
            documentType: 'FACTURA',
            totalSalesMinor: 11600n,
            exemptSalesMinor: 0n,
            taxableBaseGeneralMinor: 10000n,
            taxGeneralMinor: 1600n,
            taxGeneralPercentage: 16,
            taxableBaseReducedMinor: 0n,
            taxReducedMinor: 0n,
            taxReducedPercentage: 8,
            igtfMinor: 0n,
            vatWithheldMinor: 0n,
            withholdingVoucherNumber: null,
            currency: 'VES',
          },
        ],
        totalSalesMinor: 11600n,
        totalExemptMinor: 0n,
        totalTaxableBaseMinor: 10000n,
        totalTaxDebitMinor: 1600n,
        totalIgtfMinor: 0n,
        totalWithheldMinor: 0n,
        currency: 'VES',
      }),
    );

    useCasesMock = {
      generateSalesBook: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    const runtimeMock = {
      queries: {
        customers: {
          list: vi.fn().mockResolvedValue({ items: [] }),
        },
      },
    } as unknown as Runtime;

    controller = new GetSalesBookController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
      runtimeMock,
    );
  });

  it('delegates to generateSalesBook and returns formatted response', async () => {
    const response = await controller.run({});

    expect(response.records).toHaveLength(1);
    expect(response.records[0]?.documentNumber).toBe('FACT-0001');
    expect(response.records[0]?.controlNumber).toBe('00-00000001');
    expect(response.totalSalesMinor).toBe('11600');
    expect(response.totalTaxDebitMinor).toBe('1600');
    expect(executeSpy).toHaveBeenCalled();
  });
});
