import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from './money.js';
import { unwrap } from '../result.js';

const usd = (v: string | number) => unwrap(Money.of(v, 'USD'));

describe('Money — construccion', () => {
  it('interpreta la coma decimal como los usuarios la escriben en Venezuela', () => {
    expect(usd('25,50').minorUnits).toBe(2550n);
    expect(usd('25.50').minorUnits).toBe(2550n);
  });

  it('rechaza separadores de millares en vez de adivinar la configuracion regional', () => {
    const result = Money.of('1.234,56', 'USD');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidAmount');
  });

  it('redondea una sola vez al construir, no trunca', () => {
    // 1.005 con dos decimales tiene que subir a 1.01, no caer a 1.00
    expect(usd('1.005').toString()).toBe('1.01');
    expect(usd('1.004').toString()).toBe('1.00');
  });

  it('rechaza entradas no numericas y no finitas', () => {
    for (const bad of ['abc', '', '1.2.3', '--5', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Money.of(bad as string, 'USD').ok).toBe(false);
    }
  });

  it('acepta negativos, porque una nota anulada genera importes compensatorios', () => {
    expect(usd('-10,25').minorUnits).toBe(-1025n);
    expect(usd('-10,25').isNegative).toBe(true);
  });
});

describe('Money — aritmetica exacta', () => {
  it('no sufre el error de coma flotante de 0,1 + 0,2', () => {
    const total = unwrap(usd('0.10').add(usd('0.20')));
    expect(total.toString()).toBe('0.30');
    expect(total.equals(usd('0.30'))).toBe(true);
  });

  it('se mantiene exacto tras miles de sumas', () => {
    let acc = Money.zero('USD');
    for (let i = 0; i < 10_000; i += 1) acc = unwrap(acc.add(usd('0.01')));
    expect(acc.toString()).toBe('100.00');
  });

  it('impide sumar monedas distintas', () => {
    const mixed = usd('10').add(unwrap(Money.of('10', 'VES')));
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.error.kind).toBe('CurrencyMismatch');
  });

  it('aplica porcentajes en puntos basicos', () => {
    // 16,00 % de 100,00 = 16,00
    expect(usd('100').percentage(1600).toString()).toBe('16.00');
    expect(usd('33.33').percentage(1600).toString()).toBe('5.33');
  });

  it('multiplica por una cantidad escalada redondeando una sola vez', () => {
    // 2,5 unidades a 25,50 -> 63,75
    expect(usd('25.50').multiplyScaled(2500n, 3).toString()).toBe('63.75');
  });
});

describe('Money — allocate', () => {
  it('reparte 100 entre 3 sin perder ni inventar centimos', () => {
    const parts = usd('100').allocate([1, 1, 1]);
    expect(parts.map((p) => p.toString())).toEqual(['33.34', '33.33', '33.33']);
    const total = unwrap(Money.sum(parts, 'USD'));
    expect(total.equals(usd('100'))).toBe(true);
  });

  it('respeta pesos desiguales y sigue cuadrando', () => {
    const parts = usd('10').allocate([3, 7]);
    expect(unwrap(Money.sum(parts, 'USD')).toString()).toBe('10.00');
  });

  it('cuadra tambien con importes negativos', () => {
    const parts = usd('-100').allocate([1, 1, 1]);
    expect(unwrap(Money.sum(parts, 'USD')).toString()).toBe('-100.00');
  });

  it('propiedad: repartir siempre conserva el total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 12 }),
        (cents, weights) => {
          const amount = Money.fromMinor(BigInt(cents), 'USD');
          const parts = amount.allocate(weights);
          return unwrap(Money.sum(parts, 'USD')).equals(amount);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('Money — serializacion', () => {
  it('sobrevive al viaje de ida y vuelta por unidades menores', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), (minor) => {
        const original = Money.fromMinor(minor, 'USD');
        const restored = unwrap(Money.of(original.toString(), 'USD'));
        return restored.equals(original);
      }),
      { numRuns: 500 },
    );
  });

  it('serializa a JSON sin perder precision (bigint como string)', () => {
    expect(usd('1234.56').toJSON()).toEqual({ minorUnits: '123456', currency: 'USD' });
  });
});
