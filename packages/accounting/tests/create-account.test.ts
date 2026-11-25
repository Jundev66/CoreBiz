import { describe, expect, it } from 'vitest';
import { CreateAccountCommandHandler } from '../src/application/commands/create-account.command';
import { deterministicAccountUuid } from '../src/domain/templates/default-chart-of-accounts';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';

describe('CreateAccountCommandHandler', () => {
  it('materializes defaults and creates a child account matching parent category', async () => {
    const repo = new InMemoryAccountRepository();
    const handler = new CreateAccountCommandHandler(repo);
    const parentId = deterministicAccountUuid('t1', '1.1.01');

    const res = await handler.execute({
      id: 'acc-custom-1',
      tenantId: 't1',
      code: '1.1.01.01',
      name: 'Banco Mercantil VES',
      category: 'ASSET',
      parentId,
      isReconcilable: true,
      fiscalCountry: 'VE',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.code).toBe('1.1.01.01');

    const saved = await repo.findById('t1', 'acc-custom-1');
    expect(saved?.parentId).toBe(parentId);
    expect(saved?.category).toBe('ASSET');
  });

  it('rejects child account whose category differs from parent account', async () => {
    const repo = new InMemoryAccountRepository();
    const handler = new CreateAccountCommandHandler(repo);
    const parentId = deterministicAccountUuid('t1', '1.1.01');

    const res = await handler.execute({
      id: 'acc-bad-1',
      tenantId: 't1',
      code: '4.1.01.99',
      name: 'Subcuenta Invalida',
      category: 'REVENUE',
      parentId,
      fiscalCountry: 'VE',
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('ParentCategoryMismatch');
  });
});
