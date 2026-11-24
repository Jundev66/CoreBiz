import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAccountsController } from '../../../src/modules/accounting/controllers/list-accounts.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('ListAccountsController', () => {
  let controller: ListAccountsController;
  let executeSpy: ReturnType<typeof vi.fn>;
  let useCasesMock: {
    listAccounts: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    executeSpy = vi.fn().mockResolvedValue(
      ok([
        {
          id: 'acc-1',
          code: '1.1.01',
          name: 'Caja y Bancos',
          category: 'ASSET',
          normalSide: 'DEBIT',
          isReconcilable: true,
          isActive: true,
        },
      ]),
    );

    useCasesMock = {
      listAccounts: {
        execute: executeSpy,
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new ListAccountsController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('lists accounts and returns mapped response', async () => {
    const response = await controller.run({ fiscalCountry: 'VE' });

    expect(response).toEqual({
      accounts: [
        {
          id: 'acc-1',
          code: '1.1.01',
          name: 'Caja y Bancos',
          category: 'ASSET',
          normalSide: 'DEBIT',
          isReconcilable: true,
          isActive: true,
        },
      ],
    });
    expect(executeSpy).toHaveBeenCalledWith({
      tenantId: '018e245a-0000-7000-8000-000000000001',
      fiscalCountry: 'VE',
    });
  });
});
