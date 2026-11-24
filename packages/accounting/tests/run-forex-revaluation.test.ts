import { describe, it, expect, beforeEach } from 'vitest';
import { RunForexRevaluationCommandHandler } from '../src/application/commands/run-forex-revaluation.command';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { AccountMother } from './mothers/AccountMother';
import { RATE_SCALE } from '@corebiz/shared-kernel';

describe('RunForexRevaluationCommandHandler', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let handler: RunForexRevaluationCommandHandler;

  const tenantId = 'tenant-test-01';
  const arAccountId = 'acc-ar-01';
  const gainAccountId = 'acc-forex-gain';
  const lossAccountId = 'acc-forex-loss';

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    handler = new RunForexRevaluationCommandHandler(accountRepo, journalRepo);

    const arAccount = AccountMother.asset(
      '1.1.02.01',
      'Accounts Receivable USD',
      tenantId,
      arAccountId,
    );
    const gainAccount = AccountMother.create(
      '4.2.01.01',
      'Ganancia por Diferencia en Cambio',
      'REVENUE',
      tenantId,
      gainAccountId,
    );
    const lossAccount = AccountMother.create(
      '6.1.03.01',
      'Pérdida por Diferencia en Cambio',
      'EXPENSE',
      tenantId,
      lossAccountId,
    );

    await accountRepo.save(arAccount);
    await accountRepo.save(gainAccount);
    await accountRepo.save(lossAccount);
  });

  it('Scenario 1: revalues AR from 36.00 to 38.50 VES generating balanced journal entry with gain', async () => {
    const scaleFactor = 10n ** BigInt(RATE_SCALE);
    const historicalScaled = 36n * scaleFactor;
    const closingScaled = (385n * scaleFactor) / 10n;

    const result = await handler.execute({
      id: 'entry-forex-01',
      tenantId,
      revaluationDate: new Date('2026-11-30'),
      functionalCurrency: 'VES',
      gainAccountId,
      lossAccountId,
      positions: [
        {
          accountId: arAccountId,
          accountCode: '1.1.02.01',
          accountName: 'Accounts Receivable USD',
          positionType: 'ASSET',
          foreignCurrency: 'USD',
          foreignAmountMinor: 100000n,
          historicalRateScaled: historicalScaled,
          closingRateScaled: closingScaled,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalGainMinor).toBe(250000n);
    expect(result.value.totalLossMinor).toBe(0n);
    expect(result.value.netDeltaMinor).toBe(250000n);

    const entry = await journalRepo.findById(tenantId, 'entry-forex-01');
    expect(entry).not.toBeNull();
    expect(entry?.totalDebit).toBe(250000n);
    expect(entry?.totalCredit).toBe(250000n);

    const arLine = entry?.lines.find((l) => l.accountId === arAccountId);
    const gainLine = entry?.lines.find((l) => l.accountId === gainAccountId);

    expect(arLine?.debit.minorUnits).toBe(250000n);
    expect(gainLine?.credit.minorUnits).toBe(250000n);
  });

  it('Scenario 2: skips settled or zero-balance positions without generating empty entry', async () => {
    const scaleFactor = 10n ** BigInt(RATE_SCALE);
    const result = await handler.execute({
      id: 'entry-forex-zero',
      tenantId,
      revaluationDate: new Date('2026-11-30'),
      functionalCurrency: 'VES',
      gainAccountId,
      lossAccountId,
      positions: [
        {
          accountId: arAccountId,
          accountCode: '1.1.02.01',
          accountName: 'Accounts Receivable USD',
          positionType: 'ASSET',
          foreignCurrency: 'USD',
          foreignAmountMinor: 0n,
          historicalRateScaled: 36n * scaleFactor,
          closingRateScaled: 38n * scaleFactor,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryId).toBe('');
    expect(result.value.netDeltaMinor).toBe(0n);
  });
});
