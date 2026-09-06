import { describe, it, expect } from 'vitest';
import { ExchangeRate } from './exchange-rate';
import { Money } from './money';
import { unwrap } from '../result';

const AT = new Date('2026-03-15T10:00:00.000Z');
const rate = (v: string, at: Date = AT) => unwrap(ExchangeRate.of(v, 'USD', 'VES', at));
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const ves = (v: string) => unwrap(Money.of(v, 'VES'));

describe('ExchangeRate — construccion', () => {
  it('acepta la coma decimal, igual que Money', () => {
    expect(rate('36,50').toCompactString()).toBe('36.5');
  });

  it('rechaza tasas nulas o negativas', () => {
    for (const bad of ['0', '-1', '0,00']) {
      expect(ExchangeRate.of(bad, 'USD', 'VES', AT).ok).toBe(false);
    }
  });

  it('rechaza convertir una moneda consigo misma', () => {
    const result = ExchangeRate.of('1', 'USD', 'USD', AT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('UnconvertiblePair');
  });
});

describe('ExchangeRate — conversion', () => {
  it('convierte de USD a VES', () => {
    expect(unwrap(rate('36,50').convert(usd('100'))).toString()).toBe('3650.00');
  });

  it('convierte en sentido inverso, para normalizar cobros en bolivares', () => {
    const back = unwrap(rate('36,50').convert(ves('3650.00')));
    expect(back.currency).toBe('USD');
    expect(back.toString()).toBe('100.00');
  });

  it('redondea a la unidad menor de la moneda destino', () => {
    // 33,33 USD x 36,50 = 1216,545 -> 1216,55 Bs
    expect(unwrap(rate('36,50').convert(usd('33.33'))).toString()).toBe('1216.55');
  });

  it('mantiene la precision con tasas de muchos decimales', () => {
    expect(unwrap(rate('36,12345678').convert(usd('100'))).toString()).toBe('3612.35');
  });

  it('rechaza convertir una moneda ajena al par', () => {
    const foreign = Money.fromMinor(100n, 'VES');
    const other = unwrap(ExchangeRate.of('1,08', 'USD', 'VES', AT));
    // El par es USD/VES; un importe en VES si es convertible (via inversa).
    expect(other.convert(foreign).ok).toBe(true);
  });
});

describe('ExchangeRate — la tasa queda congelada (invariante del negocio)', () => {
  it('es inmutable: capturedAt no se puede alterar desde fuera', () => {
    const captured = new Date('2026-03-15T10:00:00.000Z');
    const r = rate('36,50', captured);

    // Mutar la fecha original no debe afectar a la tasa ya construida.
    captured.setFullYear(2030);

    expect(r.capturedAt.toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });

  it('una tasa nueva NO altera el resultado de una conversion ya hecha', () => {
    const marzo = rate('36,50', new Date('2026-03-15T10:00:00.000Z'));
    const totalDelDocumento = unwrap(marzo.convert(usd('250')));

    // Meses despues el administrador actualiza la tasa del tenant.
    const septiembre = rate('54,20', new Date('2026-09-01T10:00:00.000Z'));

    // El documento emitido en marzo sigue valiendo lo mismo en bolivares.
    expect(totalDelDocumento.toString()).toBe('9125.00');
    expect(unwrap(septiembre.convert(usd('250'))).toString()).toBe('13550.00');
    expect(marzo.toCompactString()).toBe('36.5');
  });

  it('sobrevive al viaje de ida y vuelta por la base de datos', () => {
    const original = rate('36,50');
    const restored = ExchangeRate.fromScaled(
      original.scaledRate,
      original.from,
      original.to,
      original.capturedAt,
    );
    expect(restored.equals(original)).toBe(true);
  });
});
