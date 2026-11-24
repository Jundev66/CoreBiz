import { describe, it, expect, beforeEach } from 'vitest';
import { ImportBankStatementCommandHandler } from '../src/application/commands/import-bank-statement.command';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryBankStatementRepository } from '../src/infrastructure/memory/in-memory-bank-statement-repository';
import { AccountMother } from './mothers/AccountMother';

describe('ImportBankStatementCommandHandler', () => {
  let accountRepo: InMemoryAccountRepository;
  let statementRepo: InMemoryBankStatementRepository;
  let handler: ImportBankStatementCommandHandler;

  const tenantId = 'tenant-test-01';

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    statementRepo = new InMemoryBankStatementRepository();
    handler = new ImportBankStatementCommandHandler(accountRepo, statementRepo);
  });

  it('imports valid bank statement for an existing asset bank account', async () => {
    const bankAccount = AccountMother.asset('1.1.01.02', 'Chase Checking', tenantId, 'acc-chase');
    await accountRepo.save(bankAccount);

    const result = await handler.execute({
      id: 'stmt-chase-nov2026',
      tenantId,
      bankAccountId: 'acc-chase',
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalanceMinor: 500000n,
      endingBalanceMinor: 575000n,
      lines: [
        {
          id: 'line-01',
          lineType: 'CREDIT',
          amountMinor: 80000n,
          transactionDate: new Date('2026-11-12'),
          reference: 'WIRE-9921',
          description: 'Client payment',
        },
        {
          id: 'line-02',
          lineType: 'DEBIT',
          amountMinor: 5000n,
          transactionDate: new Date('2026-11-20'),
          reference: 'FEE-112',
          description: 'Wire outgoing fee',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statementId).toBe('stmt-chase-nov2026');
    expect(result.value.lineCount).toBe(2);

    const saved = await statementRepo.findById(tenantId, 'stmt-chase-nov2026');
    expect(saved).not.toBeNull();
    expect(saved?.lines.length).toBe(2);
  });

  it('fails when target bank account does not exist or is not an asset', async () => {
    const liabilityAccount = AccountMother.liability(
      '2.1.01.01',
      'Accounts Payable',
      tenantId,
      'acc-ap',
    );
    await accountRepo.save(liabilityAccount);

    const notFound = await handler.execute({
      id: 'stmt-01',
      tenantId,
      bankAccountId: 'acc-missing',
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalanceMinor: 0n,
      endingBalanceMinor: 0n,
      lines: [],
    });
    expect(notFound.ok).toBe(false);

    const notAsset = await handler.execute({
      id: 'stmt-02',
      tenantId,
      bankAccountId: 'acc-ap',
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalanceMinor: 0n,
      endingBalanceMinor: 0n,
      lines: [],
    });
    expect(notAsset.ok).toBe(false);
  });
});
