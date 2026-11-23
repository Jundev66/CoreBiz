import { describe, expect, it } from 'vitest';
import { Rif } from '../src/domain/value-objects/rif';
import { RifMother } from './mothers/RifMother';

describe('Rif Value Object', () => {
  it('creates valid corporate Rif using Mother', () => {
    const rif = RifMother.corporate();
    expect(rif.type).toBe('J');
    expect(rif.number).toBe('12345678');
  });

  it('creates valid individual Rif using Mother', () => {
    const rif = RifMother.individual();
    expect(rif.type).toBe('V');
  });

  it('rejects invalid format', () => {
    const result = Rif.create('X-12345678-9');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidRifFormat');
    }
  });

  it('rejects invalid check digit', () => {
    const checkDigit = Rif.calculateCheckDigit('J', '12345678');
    const wrongCheckDigit = (checkDigit + 1) % 10;
    const raw = `J-12345678-${wrongCheckDigit}`;
    const result = Rif.create(raw);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidRifCheckDigit');
    }
  });
});
