import { describe, it, expect, beforeEach } from 'vitest';
import { ExecuteTreasurySwapCommandHandler } from '../src/application/commands/execute-treasury-swap.command';
import { ListTreasurySwapsQueryHandler } from '../src/application/queries/list-treasury-swaps.query';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { InMemoryTreasurySwapRepository } from '../src/infrastructure/memory/in-memory-treasury-swap-repository';
import { AccountMother } from './mothers/AccountMother';

describe('ExecuteTreasurySwapCommandHandler & ListTreasurySwapsQueryHandler', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let swapRepo: InMemoryTreasurySwapRepository;
  let executeHandler: ExecuteTreasurySwapCommandHandler;
  let listHandler: ListTreasurySwapsQueryHandler;

  const tenantId = 'tenant-treasury-01';
  const vesBankAccountId = 'acc-ves-bank';
  const usdtWalletAccountId = 'acc-usdt-wallet';
  const usdBankAccountId = 'acc-usd-bank';
  const feeAccountId = 'acc-financial-fee';

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    swapRepo = new InMemoryTreasurySwapRepository();

    executeHandler = new ExecuteTreasurySwapCommandHandler(accountRepo, journalRepo, swapRepo);
    listHandler = new ListTreasurySwapsQueryHandler(swapRepo);

    const vesBank = AccountMother.asset(
      '1.1.01.01',
      'Banco Provincial VES',
      tenantId,
      vesBankAccountId,
    );
    const usdtWallet = AccountMother.asset(
      '1.1.04.01',
      'Binance USDT Wallet',
      tenantId,
      usdtWalletAccountId,
    );
    const usdBank = AccountMother.asset(
      '1.1.01.02',
      'Banesco Panama USD',
      tenantId,
      usdBankAccountId,
    );
    const feeAccount = AccountMother.create(
      '6.1.02.01',
      'Comisiones Bancarias y P2P',
      'EXPENSE',
      tenantId,
      feeAccountId,
    );

    await accountRepo.save(vesBank);
    await accountRepo.save(usdtWallet);
    await accountRepo.save(usdBank);
    await accountRepo.save(feeAccount);
  });

  it('Scenario 1: executes VES to USDT swap isolating fee and enforcing double-entry balance', async () => {
    const rateScaled = 50_0000_0000n;

    const result = await executeHandler.execute({
      id: 'swap-ves-usdt-01',
      tenantId,
      date: new Date('2026-11-24T12:00:00Z'),
      sourceAccountId: vesBankAccountId,
      sourceCurrency: 'VES',
      sourceAmountMinor: 100_000_00n,
      targetAccountId: usdtWalletAccountId,
      targetCurrency: 'USD',
      targetAmountMinor: 1_995_00n,
      feeAccountId,
      feeAmountMinor: 5_00n,
      exchangeRateScaled: rateScaled,
      counterpartyReference: 'BINANCE-P2P-9988771122',
      operatorUserId: 'user-treasury-ops-01',
      description: 'Compra P2P 2,000 USDT para pago a proveedores internacionales',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { swap, journalEntry } = result.value;

    expect(swap.id).toBe('swap-ves-usdt-01');
    expect(swap.swapNumber).toBe(1n);
    expect(swap.status).toBe('COMPLETED');
    expect(swap.counterpartyReference).toBe('BINANCE-P2P-9988771122');
    expect(swap.operatorUserId).toBe('user-treasury-ops-01');
    expect(swap.sourceAmount.minorUnits).toBe(100_000_00n);
    expect(swap.targetAmount.minorUnits).toBe(1_995_00n);

    expect(journalEntry.sourceType).toBe('TREASURY_SWAP');
    expect(journalEntry.sourceId).toBe('swap-ves-usdt-01');
    expect(journalEntry.currency).toBe('VES');
    expect(journalEntry.totalDebit).toBe(100_000_00n);
    expect(journalEntry.totalCredit).toBe(100_000_00n);

    const savedSwap = await swapRepo.findById(tenantId, 'swap-ves-usdt-01');
    expect(savedSwap).toBeDefined();

    const savedEntry = await journalRepo.findById(tenantId, journalEntry.id);
    expect(savedEntry).toBeDefined();

    const swapList = await listHandler.execute(tenantId);
    expect(swapList.length).toBe(1);
    expect(swapList[0]?.id).toBe('swap-ves-usdt-01');
  });

  it('Scenario 2: executes same-currency USD bank to USDT wallet with platform gas fee', async () => {
    const rateScaled = 1_0000_0000n;

    const result = await executeHandler.execute({
      id: 'swap-usd-usdt-02',
      tenantId,
      date: new Date('2026-11-24T13:00:00Z'),
      sourceAccountId: usdBankAccountId,
      sourceCurrency: 'USD',
      sourceAmountMinor: 1_000_00n,
      targetAccountId: usdtWalletAccountId,
      targetCurrency: 'USD',
      targetAmountMinor: 990_00n,
      feeAccountId,
      feeAmountMinor: 10_00n,
      exchangeRateScaled: rateScaled,
      counterpartyReference: 'TX-0xabcdef1234567890',
      operatorUserId: 'user-treasury-ops-02',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { swap, journalEntry } = result.value;

    expect(swap.status).toBe('COMPLETED');
    expect(journalEntry.currency).toBe('USD');
    expect(journalEntry.totalDebit).toBe(1_000_00n);
    expect(journalEntry.totalCredit).toBe(1_000_00n);
  });

  it('Scenario 3: rejects swap when accounts are identical or not asset category', async () => {
    const identicalResult = await executeHandler.execute({
      id: 'swap-invalid-01',
      tenantId,
      date: new Date(),
      sourceAccountId: vesBankAccountId,
      sourceCurrency: 'VES',
      sourceAmountMinor: 50_000_00n,
      targetAccountId: vesBankAccountId,
      targetCurrency: 'VES',
      targetAmountMinor: 50_000_00n,
      feeAccountId,
      feeAmountMinor: 0n,
      exchangeRateScaled: 1_0000_0000n,
      counterpartyReference: 'REF-01',
      operatorUserId: 'user-01',
    });

    expect(identicalResult.ok).toBe(false);
    if (!identicalResult.ok) {
      expect(identicalResult.error.kind).toBe('IdenticalAccounts');
    }

    const wrongCategoryResult = await executeHandler.execute({
      id: 'swap-invalid-02',
      tenantId,
      date: new Date(),
      sourceAccountId: feeAccountId,
      sourceCurrency: 'VES',
      sourceAmountMinor: 50_000_00n,
      targetAccountId: usdtWalletAccountId,
      targetCurrency: 'USD',
      targetAmountMinor: 1_000_00n,
      feeAccountId,
      feeAmountMinor: 0n,
      exchangeRateScaled: 50_0000_0000n,
      counterpartyReference: 'REF-02',
      operatorUserId: 'user-01',
    });

    expect(wrongCategoryResult.ok).toBe(false);
    if (!wrongCategoryResult.ok) {
      expect(wrongCategoryResult.error.kind).toBe('SourceAccountNotAsset');
    }
  });

  it('rejects swap with InsufficientFunds when validateAvailableBalance is enabled on empty source account', async () => {
    const result = await executeHandler.execute({
      id: 'swap-insufficient-01',
      tenantId,
      date: new Date('2026-11-24T12:00:00Z'),
      sourceAccountId: usdBankAccountId,
      sourceCurrency: 'USD',
      sourceAmountMinor: 500_00n,
      targetAccountId: usdtWalletAccountId,
      targetCurrency: 'USD',
      targetAmountMinor: 500_00n,
      feeAccountId,
      feeAmountMinor: 0n,
      exchangeRateScaled: 1_0000_0000n,
      counterpartyReference: 'TEST-EMPTY',
      operatorUserId: 'user-treasury-ops-01',
      validateAvailableBalance: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InsufficientFunds');
    }
  });
});
