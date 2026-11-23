import { describe, it, expect } from 'vitest';
import { AccountMother } from './mothers/AccountMother';
import { resolveNormalBalanceSide } from '../src/domain/model/account-type';

describe('Account', () => {
  it('correctly maps normal balance side based on category', () => {
    expect(resolveNormalBalanceSide('ASSET')).toBe('DEBIT');
    expect(resolveNormalBalanceSide('COGS')).toBe('DEBIT');
    expect(resolveNormalBalanceSide('EXPENSE')).toBe('DEBIT');
    expect(resolveNormalBalanceSide('LIABILITY')).toBe('CREDIT');
    expect(resolveNormalBalanceSide('EQUITY')).toBe('CREDIT');
    expect(resolveNormalBalanceSide('REVENUE')).toBe('CREDIT');
  });

  it('initializes account with computed normalSide and expected attributes', () => {
    const assetAccount = AccountMother.asset('1.1.01.01', 'Bank Checking');
    expect(assetAccount.normalSide).toBe('DEBIT');
    expect(assetAccount.category).toBe('ASSET');
    expect(assetAccount.isActive).toBe(true);

    const liabilityAccount = AccountMother.liability('2.1.01.01', 'Accounts Payable');
    expect(liabilityAccount.normalSide).toBe('CREDIT');
    expect(liabilityAccount.category).toBe('LIABILITY');
  });
});
