import { describe, it, expect, beforeEach } from 'vitest';
import { RecordDisbursementCommandHandler } from '../src/application/commands/record-disbursement.command';
import { ListDisbursementsQueryHandler } from '../src/application/queries/list-disbursements.query';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { InMemoryDisbursementRepository } from '../src/infrastructure/memory/in-memory-disbursement-repository';
import { AccountMother } from './mothers/AccountMother';

describe('Operational Expenses & Disbursements Handlers', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let disbursementRepo: InMemoryDisbursementRepository;
  let recordHandler: RecordDisbursementCommandHandler;
  let listHandler: ListDisbursementsQueryHandler;

  const tenantId = 'tenant-disbursement-01';
  const cashAccountId = 'acc-cash';
  const logisticsAccountId = 'acc-logistics';
  const rentAccountId = 'acc-rent';

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    disbursementRepo = new InMemoryDisbursementRepository();

    recordHandler = new RecordDisbursementCommandHandler(
      accountRepo,
      journalRepo,
      disbursementRepo,
    );
    listHandler = new ListDisbursementsQueryHandler(disbursementRepo);

    const cashAccount = AccountMother.asset('1.1.01.01', 'Caja Principal', tenantId, cashAccountId);
    const logisticsExpense = AccountMother.create(
      '6.1.03.01',
      'Fletes y Envíos',
      'EXPENSE',
      tenantId,
      logisticsAccountId,
    );
    const rentExpense = AccountMother.create(
      '6.1.04.01',
      'Alquiler de Local',
      'EXPENSE',
      tenantId,
      rentAccountId,
    );

    await accountRepo.save(cashAccount);
    await accountRepo.save(logisticsExpense);
    await accountRepo.save(rentExpense);
  });

  it('records an operational logistics disbursement with exact double-entry balance', async () => {
    const result = await recordHandler.execute({
      id: 'disb-001',
      tenantId,
      date: new Date('2026-11-24T10:00:00.000Z'),
      category: 'LOGISTICS',
      beneficiary: 'Transportes Rápidos C.A.',
      taxId: 'J-12345678-9',
      receiptNumber: 'FACT-9921',
      sourceAccountId: cashAccountId,
      expenseAccountId: logisticsAccountId,
      currency: 'USD',
      amountMinor: 4500n,
      notes: 'Flete marítimo de mercancía',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.disbursement.disbursementNumber).toBe(1n);
    expect(result.value.disbursement.amount.toString()).toBe('45.00');
    expect(result.value.disbursement.category).toBe('LOGISTICS');

    const journal = result.value.journalEntry;
    expect(journal.totalDebit).toBe(4500n);
    expect(journal.totalCredit).toBe(4500n);
    expect(journal.totalDebit).toBe(journal.totalCredit);
    expect(journal.lines).toHaveLength(2);

    const expenseLine = journal.lines.find((l) => l.accountId === logisticsAccountId);
    const cashLine = journal.lines.find((l) => l.accountId === cashAccountId);

    expect(expenseLine?.debit.minorUnits).toBe(4500n);
    expect(expenseLine?.credit.minorUnits).toBe(0n);
    expect(cashLine?.debit.minorUnits).toBe(0n);
    expect(cashLine?.credit.minorUnits).toBe(4500n);

    const listResult = await listHandler.execute({ tenantId });
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    expect(listResult.value).toHaveLength(1);
    expect(listResult.value[0]?.beneficiary).toBe('Transportes Rápidos C.A.');
    expect(listResult.value[0]?.amount).toBe('45.00');
  });

  it('rejects disbursement when amount is zero or negative', async () => {
    const result = await recordHandler.execute({
      id: 'disb-002',
      tenantId,
      date: new Date(),
      category: 'UTILITIES_RENT',
      beneficiary: 'Inmobiliaria Central',
      sourceAccountId: cashAccountId,
      expenseAccountId: rentAccountId,
      currency: 'USD',
      amountMinor: 0n,
      notes: 'Pago nulo',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InvalidAmount');
  });

  it('rejects disbursement when beneficiary is empty', async () => {
    const result = await recordHandler.execute({
      id: 'disb-003',
      tenantId,
      date: new Date(),
      category: 'GENERAL',
      beneficiary: '   ',
      sourceAccountId: cashAccountId,
      expenseAccountId: logisticsAccountId,
      currency: 'USD',
      amountMinor: 1000n,
      notes: 'Sin beneficiario',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('EmptyBeneficiary');
  });

  it('rejects disbursement when source account and expense account are identical', async () => {
    const result = await recordHandler.execute({
      id: 'disb-004',
      tenantId,
      date: new Date(),
      category: 'GENERAL',
      beneficiary: 'Auto-transferencia inválida',
      sourceAccountId: cashAccountId,
      expenseAccountId: cashAccountId,
      currency: 'USD',
      amountMinor: 2000n,
      notes: 'Cuentas idénticas',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('IdenticalAccounts');
  });
});
