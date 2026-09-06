import { describe, it, expect } from 'vitest';
import { Money, pow10 } from './money';
import { Quantity } from './quantity';
import { ExchangeRate } from './exchange-rate';
import { unwrap } from '../result';
import { assertNever } from '../errors';

const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const AT = new Date('2026-03-15T10:00:00.000Z');

describe('Politicas de redondeo', () => {
  it('HALF_UP sube en el empate', () => {
    // 1,005 -> 2 decimales
    expect(usd('10').multiplyScaled(1005n, 3, 'HALF_UP').toString()).toBe('10.05');
  });

  it('HALF_EVEN empata hacia el par (reduce el sesgo acumulado)', () => {
    // 0,125 -> 0,12 (2 es par);  0,135 -> 0,14 (4 es par)
    expect(usd('1').multiplyScaled(125n, 3, 'HALF_EVEN').toString()).toBe('0.12');
    expect(usd('1').multiplyScaled(135n, 3, 'HALF_EVEN').toString()).toBe('0.14');
  });

  it('DOWN trunca hacia cero', () => {
    expect(usd('1').multiplyScaled(199n, 3, 'DOWN').toString()).toBe('0.19');
  });

  it('respeta el signo en las tres politicas', () => {
    expect(usd('-1').multiplyScaled(1005n, 3, 'HALF_UP').toString()).toBe('-1.01');
    expect(usd('-1').multiplyScaled(125n, 3, 'HALF_EVEN').toString()).toBe('-0.12');
    expect(usd('-1').multiplyScaled(199n, 3, 'DOWN').toString()).toBe('-0.19');
  });

  it('pow10 produce potencias exactas como bigint', () => {
    expect(pow10(0)).toBe(1n);
    expect(pow10(8)).toBe(100_000_000n);
  });
});

describe('Money — comparacion y utilidades', () => {
  it('compare devuelve -1, 0 o 1', () => {
    expect(unwrap(usd('5').compare(usd('10')))).toBe(-1);
    expect(unwrap(usd('10').compare(usd('10')))).toBe(0);
    expect(unwrap(usd('15').compare(usd('10')))).toBe(1);
  });

  it('compare falla entre monedas distintas en vez de dar un orden falso', () => {
    const result = usd('5').compare(unwrap(Money.of('5', 'VES')));
    expect(result.ok).toBe(false);
  });

  it('negate invierte el signo, para los movimientos compensatorios de una anulacion', () => {
    expect(usd('25.50').negate().toString()).toBe('-25.50');
    expect(usd('25.50').negate().negate().equals(usd('25.50'))).toBe(true);
  });

  it('subtract resta dentro de la misma moneda y falla entre monedas distintas', () => {
    expect(unwrap(usd('10').subtract(usd('2.50'))).toString()).toBe('7.50');
    expect(usd('10').subtract(unwrap(Money.of('1', 'VES'))).ok).toBe(false);
  });

  it('expone zero, isZero y scale', () => {
    expect(Money.zero('USD').isZero).toBe(true);
    expect(Money.zero('USD').scale).toBe(2);
    expect(usd('0.01').isZero).toBe(false);
  });

  it('sum falla si la lista mezcla monedas', () => {
    expect(Money.sum([usd('1'), unwrap(Money.of('1', 'VES'))], 'USD').ok).toBe(false);
  });

  it('allocate con lista vacia devuelve lista vacia', () => {
    expect(usd('10').allocate([])).toEqual([]);
  });

  it('allocate rechaza pesos que no suman positivo', () => {
    expect(() => usd('10').allocate([0, 0])).toThrow(/pesos sea positiva/);
  });
});

describe('Quantity — utilidades restantes', () => {
  it('expone isPositive, isZero y negate', () => {
    expect(Quantity.of('1').ok && unwrap(Quantity.of('1')).isPositive).toBe(true);
    expect(Quantity.zero().isZero).toBe(true);
    expect(unwrap(Quantity.of('2.5')).negate().toString()).toBe('-2.500');
  });

  it('isLessThan y equals comparan correctamente', () => {
    const dos = unwrap(Quantity.of('2'));
    expect(dos.isLessThan(unwrap(Quantity.of('3')))).toBe(true);
    expect(dos.equals(unwrap(Quantity.of('2.000')))).toBe(true);
  });

  it('fromScaled y toJSON cierran el ciclo con la base de datos', () => {
    const restored = Quantity.fromScaled(2500n);
    expect(restored.toString()).toBe('2.500');
    expect(restored.toJSON()).toBe('2.500');
  });

  it('toCompactString colapsa el cero a "0"', () => {
    expect(Quantity.zero().toCompactString()).toBe('0');
  });
});

describe('ExchangeRate — utilidades restantes', () => {
  it('rechaza tasas no finitas', () => {
    expect(ExchangeRate.of(Number.NaN, 'USD', 'VES', AT).ok).toBe(false);
    expect(ExchangeRate.of(Number.POSITIVE_INFINITY, 'USD', 'VES', AT).ok).toBe(false);
  });

  it('convierte aplicando DOWN y HALF_EVEN cuando se piden', () => {
    const r = unwrap(ExchangeRate.of('36,505', 'USD', 'VES', AT));
    expect(unwrap(r.convert(usd('1'), 'DOWN')).toString()).toBe('36.50');
    expect(unwrap(r.convert(usd('1'), 'HALF_UP')).toString()).toBe('36.51');
  });

  it('toString conserva los ocho decimales y toJSON serializa sin perder precision', () => {
    const r = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    expect(r.toString()).toBe('36.50000000');
    expect(r.toJSON()).toEqual({
      scaledRate: '3650000000',
      from: 'USD',
      to: 'VES',
      capturedAt: AT.toISOString(),
    });
  });

  it('equals distingue tasas capturadas en momentos distintos', () => {
    const a = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    const b = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', new Date('2026-04-01T00:00:00.000Z')));
    expect(a.equals(b)).toBe(false);
  });

  it('convertir cero da cero sin redondeos raros', () => {
    const r = unwrap(ExchangeRate.of('36,5', 'USD', 'VES', AT));
    expect(unwrap(r.convert(Money.zero('USD'))).isZero).toBe(true);
  });
});

describe('assertNever', () => {
  it('lanza al alcanzar una variante no manejada', () => {
    expect(() => assertNever('inesperado' as never, 'estado')).toThrow(/estado no manejado/);
  });
});
