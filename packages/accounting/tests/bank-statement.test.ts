import { describe, it, expect } from 'vitest';
import { BankStatement } from '../src/domain/model/bank-statement';
import { BankStatementLine } from '../src/domain/model/bank-statement-line';
import { Money } from '@corebiz/shared-kernel';

describe('BankStatement & BankStatementLine', () => {
  const tenantId = 'tenant-test-01';
  const bankAccountId = 'acc-bank-01';

  it('creates statement and calculates net movement and balances', () => {
    const startingBalance = Money.fromMinor(100000n, 'USD');
    const endingBalance = Money.fromMinor(145000n, 'USD');

    const line1Result = BankStatementLine.create({
      id: 'line-01',
      statementId: 'stmt-01',
      lineType: 'CREDIT',
      amount: Money.fromMinor(50000n, 'USD'),
      transactionDate: new Date('2026-11-05'),
      reference: 'DEP-1001',
      description: 'Customer wire transfer',
    });

    const line2Result = BankStatementLine.create({
      id: 'line-02',
      statementId: 'stmt-01',
      lineType: 'DEBIT',
      amount: Money.fromMinor(5000n, 'USD'),
      transactionDate: new Date('2026-11-10'),
      reference: 'FEE-001',
      description: 'Monthly account maintenance fee',
    });

    expect(line1Result.ok).toBe(true);
    expect(line2Result.ok).toBe(true);
    if (!line1Result.ok || !line2Result.ok) return;

    const statementResult = BankStatement.create({
      id: 'stmt-01',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance,
      endingBalance,
      lines: [line1Result.value, line2Result.value],
    });

    expect(statementResult.ok).toBe(true);
    if (!statementResult.ok) return;

    const statement = statementResult.value;
    expect(statement.calculateTotalCredits().minorUnits).toBe(50000n);
    expect(statement.calculateTotalDebits().minorUnits).toBe(5000n);
    expect(statement.calculateNetMovement().minorUnits).toBe(45000n);
    expect(statement.calculateCalculatedEndingBalance().minorUnits).toBe(145000n);
    expect(statement.calculateUnmatchedLines().length).toBe(2);
  });

  it('rejects invalid date ranges and mismatched currencies', () => {
    const resDate = BankStatement.create({
      id: 'stmt-bad-date',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-12-01'),
      endDate: new Date('2026-11-01'),
      startingBalance: Money.fromMinor(0n, 'USD'),
      endingBalance: Money.fromMinor(0n, 'USD'),
    });
    expect(resDate.ok).toBe(false);

    const resCurr = BankStatement.create({
      id: 'stmt-bad-curr',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(0n, 'VES'),
      endingBalance: Money.fromMinor(0n, 'USD'),
    });
    expect(resCurr.ok).toBe(false);
  });

  it('matches line and transitions to reconciled when fully matched and balances agree', () => {
    const lineResult = BankStatementLine.create({
      id: 'line-01',
      statementId: 'stmt-01',
      lineType: 'CREDIT',
      amount: Money.fromMinor(25000n, 'USD'),
      transactionDate: new Date('2026-11-05'),
      reference: 'DEP-1001',
      description: 'Deposit',
    });
    if (!lineResult.ok) return;

    const statementResult = BankStatement.create({
      id: 'stmt-01',
      tenantId,
      bankAccountId,
      currency: 'USD',
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-30'),
      startingBalance: Money.fromMinor(0n, 'USD'),
      endingBalance: Money.fromMinor(25000n, 'USD'),
      lines: [lineResult.value],
    });
    if (!statementResult.ok) return;

    let statement = statementResult.value;
    const matchResult = statement.matchLine('line-01', 'entry-001', 'line-001');
    expect(matchResult.ok).toBe(true);
    if (!matchResult.ok) return;
    statement = matchResult.value;

    expect(statement.calculateMatchedLines().length).toBe(1);
    expect(statement.calculateUnmatchedLines().length).toBe(0);
    expect(statement.calculateReconciledBalance().minorUnits).toBe(25000n);

    const reconcileResult = statement.markReconciled(Money.fromMinor(25000n, 'USD'));
    expect(reconcileResult.ok).toBe(true);
    if (!reconcileResult.ok) return;
    expect(reconcileResult.value.status).toBe('RECONCILED');
  });
});
