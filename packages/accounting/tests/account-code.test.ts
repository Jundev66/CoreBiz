import { describe, it, expect } from 'vitest';
import { AccountCode } from '../src/domain/model/account-code';

describe('AccountCode', () => {
  it('creates valid account codes with single or multiple segments', () => {
    const rootResult = AccountCode.create('1');
    expect(rootResult.ok).toBe(true);
    if (!rootResult.ok) return;
    expect(rootResult.value.value).toBe('1');
    expect(rootResult.value.level()).toBe(1);
    expect(rootResult.value.parentCode()).toBeNull();

    const nestedResult = AccountCode.create('1.1.01.002');
    expect(nestedResult.ok).toBe(true);
    if (!nestedResult.ok) return;
    expect(nestedResult.value.value).toBe('1.1.01.002');
    expect(nestedResult.value.level()).toBe(4);
    expect(nestedResult.value.parentCode()).toBe('1.1.01');
  });

  it('rejects invalid account code formats', () => {
    const emptyResult = AccountCode.create('');
    expect(emptyResult.ok).toBe(false);

    const alphaResult = AccountCode.create('1.A.01');
    expect(alphaResult.ok).toBe(false);

    const trailingDotResult = AccountCode.create('1.1.');
    expect(trailingDotResult.ok).toBe(false);
  });
});
