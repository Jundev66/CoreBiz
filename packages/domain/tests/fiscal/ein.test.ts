import { describe, expect, it } from 'vitest';
import { Ein } from '../../src/fiscal/value-objects/ein';
import { EinMother } from './EinMother';

describe('Ein Value Object', () => {
  it('creates valid Ein using Mother', () => {
    const ein = EinMother.create();
    expect(ein.prefix).toBe('12');
    expect(ein.serial).toBe('3456789');
    expect(ein.value()).toBe('12-3456789');
  });

  it('creates valid Ein without hyphen', () => {
    const result = Ein.create('987654321');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value()).toBe('98-7654321');
    }
  });

  it('rejects invalid format', () => {
    const result = Ein.create('12-345');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidEinFormat');
    }
  });
});
