import { describe, it, expect } from 'vitest';
import { Quantity } from './quantity';
import { unwrap } from '../result';

const q = (v: string | number) => unwrap(Quantity.of(v));

describe('Quantity — construccion', () => {
  it('acepta hasta tres decimales, para vender fracciones reales', () => {
    expect(q('0,250').toString()).toBe('0.250');
    expect(q('1.500').toCompactString()).toBe('1.5');
    expect(q(3).toCompactString()).toBe('3');
  });

  it('rechaza el exceso de decimales en vez de redondearlo en silencio', () => {
    const result = Quantity.of('1.2345');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('TooManyDecimals');
      if (result.error.kind === 'TooManyDecimals') expect(result.error.max).toBe(3);
    }
  });

  it('rechaza entradas invalidas', () => {
    for (const bad of ['abc', '', '1..2', Number.NaN]) {
      expect(Quantity.of(bad as string).ok).toBe(false);
    }
  });

  it('positive() exige una cantidad mayor que cero', () => {
    expect(Quantity.positive('0').ok).toBe(false);
    expect(Quantity.positive('-1').ok).toBe(false);
    expect(Quantity.positive('0.001').ok).toBe(true);
  });
});

describe('Quantity — aritmetica exacta', () => {
  it('no acumula error de coma flotante', () => {
    let acc = Quantity.zero();
    for (let i = 0; i < 1000; i += 1) acc = acc.add(q('0.001'));
    expect(acc.toString()).toBe('1.000');
  });

  it('resta y admite resultados negativos (ajustes de inventario)', () => {
    expect(q('2.5').subtract(q('4')).toString()).toBe('-1.500');
    expect(q('2.5').subtract(q('4')).isNegative).toBe(true);
  });

  it('compara para decidir si hay stock suficiente', () => {
    const disponible = q('10');
    const pedido = q('50');
    expect(pedido.isGreaterThan(disponible)).toBe(true);
    expect(disponible.compare(pedido)).toBe(-1);
    expect(disponible.compare(q('10'))).toBe(0);
  });

  it('suma una lista de cantidades', () => {
    expect(Quantity.sum([q('1.5'), q('2.25'), q('0.25')]).toString()).toBe('4.000');
  });
});
