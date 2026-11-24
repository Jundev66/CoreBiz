import { describe, it, expect, beforeEach } from 'vitest';
import { RecordBankAdjustmentCommandHandler } from '../src/application/commands/record-bank-adjustment.command';
import { InMemoryBankStatementRepository } from '../src/infrastructure/memory/in-memory-bank-statement-repository';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { BankStatement } from '../src/domain/model/bank-statement';
import { BankStatementLine } from '../src/domain/model/bank-statement-line';
import { Money } from '@corebiz/shared-kernel';
import { AccountMother } from './mothers/AccountMother';

describe('RecordBankAdjustmentCommandHandler', () => {
  let statementRepo: InMemoryBankStatementRepository;
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: RecordBankAdjustmentCommandHandler;

  const tenantId = 'tenant-test-01';
  const bankAccountId = 'acc-bank-01';
  const feeAccountId = 'acc-bank-fees';

  beforeEach(async () => {
    statementRepo = new InMemoryBankStatementRepository();
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new RecordBankAdjustmentCommandHandler(statementRepo, accountRepo, journalRepo);

    const bankAccount = AccountMother.asset('1.1.01.01', 'Bank Checking', tenantId, bankAccountId);
    const feeAccount = AccountMother.create(
      '6.1.02.01',
      'Bank Service Charges',
      'EXPENSE',
      tenantId,
      feeAccountId,
    );
    await accountRepo.save(bankAccount);
    await accountRepo.save(feeAccount);
  });

  it('records balanced bank fee adjustment entry and marks statement line as adjusted', async () => {
    const feeLineResult = BankStatementLine.create({
      id: 'line-fee-01',
      statementId: 'stmt-adj-01',
      lineType: 'DEBIT',
      amount: Money.fromMinor(1500n, 'USD'),
      transactionDate: new Date('2026-11-28'),
      reference: 'FEE-NOV',
      description: 'Monthly Maintenance Fee',
    });
    if (!feeLineResult.ok) return;

    const statementResult = BankStatement.create({
      id: 'stmt-adj-01',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(100000n, 'USD'),
      endingBalance: Money.fromMinor(98500n, 'USD'),
      lines: [feeLineResult.value],
    });
    if (!statementResult.ok) return;
    await statementRepo.save(statementResult.value);

    const result = await handler.execute({
      id: 'entry-fee-adj-01',
      tenantId,
      statementId: 'stmt-adj-01',
      statementLineId: 'line-fee-01',
      counterpartAccountId: feeAccountId,
      description: 'Bank monthly service charge',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.journalEntryId).toBe('entry-fee-adj-01');

    const postedEntry = await journalRepo.findById(tenantId, 'entry-fee-adj-01');
    expect(postedEntry).not.toBeNull();
    expect(postedEntry?.totalDebit).toBe(1500n);
    expect(postedEntry?.totalCredit).toBe(1500n);

    const expenseLine = postedEntry?.lines.find((l) => l.accountId === feeAccountId);
    const bankLine = postedEntry?.lines.find((l) => l.accountId === bankAccountId);
    expect(expenseLine?.debit.minorUnits).toBe(1500n);
    expect(bankLine?.credit.minorUnits).toBe(1500n);

    const updatedStatement = await statementRepo.findById(tenantId, 'stmt-adj-01');
    expect(updatedStatement?.lines[0]?.status).toBe('ADJUSTED');
    expect(updatedStatement?.lines[0]?.matchedJournalEntryId).toBe('entry-fee-adj-01');
  });
});
