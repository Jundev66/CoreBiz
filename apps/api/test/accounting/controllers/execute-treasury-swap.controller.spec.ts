import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteTreasurySwapController } from '../../../src/modules/accounting/controllers/execute-treasury-swap.controller';
import { ListTreasurySwapsController } from '../../../src/modules/accounting/controllers/list-treasury-swaps.controller';
import { ok, Money } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('Treasury Swaps Controllers', () => {
  const tenantId = '018e245a-0000-7000-8000-000000000001';
  let executeController: ExecuteTreasurySwapController;
  let listController: ListTreasurySwapsController;
  let useCasesMock: {
    executeTreasurySwap: { execute: ReturnType<typeof vi.fn> };
    listTreasurySwaps: { execute: ReturnType<typeof vi.fn> };
  };
  let tenantCtxMock: TenantContext;

  const mockSwap = {
    id: 'swap-test-01',
    tenantId,
    swapNumber: 12n,
    date: new Date('2026-11-24T10:00:00Z'),
    sourceAccountId: 'acc-source',
    sourceCurrency: 'VES' as const,
    sourceAmount: Money.fromMinor(10000000n, 'VES'),
    targetAccountId: 'acc-target',
    targetCurrency: 'USD' as const,
    targetAmount: Money.fromMinor(199500n, 'USD'),
    feeAccountId: 'acc-fee',
    feeAmount: Money.fromMinor(500n, 'USD'),
    exchangeRateScaled: 50_0000_0000n,
    counterpartyReference: 'P2P-ORDER-12345',
    operatorUserId: 'user-01',
    description: 'Swap test',
    journalEntryId: 'je-01',
    status: 'COMPLETED' as const,
    createdAt: new Date('2026-11-24T10:00:00Z'),
  };

  beforeEach(() => {
    useCasesMock = {
      executeTreasurySwap: {
        execute: vi.fn().mockResolvedValue(
          ok({
            swap: mockSwap,
            journalEntry: { id: 'je-01' },
          }),
        ),
      },
      listTreasurySwaps: {
        execute: vi.fn().mockResolvedValue([mockSwap]),
      },
    };

    tenantCtxMock = {
      tenantId,
      actor: { userId: 'user-01' },
    } as unknown as TenantContext;

    executeController = new ExecuteTreasurySwapController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
    listController = new ListTreasurySwapsController(
      useCasesMock as unknown as UseCases,
      tenantCtxMock,
    );
  });

  it('executes treasury swap and returns formatted response DTO', async () => {
    const res = await executeController.run({
      date: new Date('2026-11-24'),
      sourceAccountId: 'acc-source',
      sourceCurrency: 'VES',
      sourceAmount: '100000.00',
      targetAccountId: 'acc-target',
      targetCurrency: 'USD',
      targetAmount: '1995.00',
      feeAccountId: 'acc-fee',
      feeAmount: '5.00',
      exchangeRate: '50.00',
      counterpartyReference: 'P2P-ORDER-12345',
      description: 'Swap test',
    });

    expect(res.id).toBe('swap-test-01');
    expect(res.swapNumber).toBe('12');
    expect(res.sourceAmount).toBe('100000.00');
    expect(res.targetAmount).toBe('1995.00');
    expect(res.feeAmount).toBe('5.00');
    expect(res.exchangeRate).toBe('50.0000');
    expect(res.counterpartyReference).toBe('P2P-ORDER-12345');
    expect(res.status).toBe('COMPLETED');
  });

  it('lists treasury swaps for tenant', async () => {
    const res = await listController.list();
    expect(res.length).toBe(1);
    expect(res[0]?.id).toBe('swap-test-01');
    expect(res[0]?.counterpartyReference).toBe('P2P-ORDER-12345');
  });
});
