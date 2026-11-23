import { describe, expect, it } from 'vitest';
import { AccountCode } from '../../src/accounting/model/account-code';

describe('AccountCode Value Object', () => {
  it('creates root level code', () => {
    const result = AccountCode.create('1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('1');
      expect(result.value.level()).toBe(1);
      expect(result.value.parentCode()).toBeNull();
    }
  });

  it('creates multi-level hierarchical code and resolves parent', () => {
    const result = AccountCode.create('1.1.02.01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('1.1.02.01');
      expect(result.value.level()).toBe(4);
      expect(result.value.parentCode()).toBe('1.1.02');
    }
  });

  it('rejects invalid code', () => {
    const result = AccountCode.create('1.1..01');
    expect(result.ok).toBe(false);
  });
});
