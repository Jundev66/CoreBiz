import { describe, expect, it } from 'vitest';
import { Account, AccountCode, ListAccountsQueryHandler } from '../src';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';

describe('ListAccountsQueryHandler', () => {
  it('returns tenant accounts when they exist', async () => {
    const repo = new InMemoryAccountRepository();
    const code = AccountCode.create('1.1.01');
    expect(code.ok).toBe(true);

    if (code.ok) {
      await repo.save(
        new Account({
          id: 'acc-1',
          tenantId: 'tenant-1',
          code: code.value,
          name: 'Caja Principal',
          category: 'ASSET',
          isReconcilable: true,
          isActive: true,
        }),
      );
    }

    const handler = new ListAccountsQueryHandler(repo);
    const result = await handler.execute({ tenantId: 'tenant-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.code).toBe('1.1.01');
      expect(result.value[0]?.name).toBe('Caja Principal');
    }
  });

  it('falls back to fiscal country template when no accounts are persisted', async () => {
    const repo = new InMemoryAccountRepository();
    const handler = new ListAccountsQueryHandler(repo);
    const result = await handler.execute({ tenantId: 'tenant-empty', fiscalCountry: 'VE' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some((a) => a.code === '1.1.01')).toBe(true);
    }
  });
});
