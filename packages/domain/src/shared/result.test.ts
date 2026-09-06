import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, map, flatMap, mapErr, combine, unwrap, unwrapOr } from './result.js';

describe('Result', () => {
  it('distingue exito de fallo sin lanzar excepciones', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('boom'))).toBe(true);
  });

  it('map transforma el valor y deja pasar el error', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(map(err('boom'), (n: number) => n * 3)).toEqual({ ok: false, error: 'boom' });
  });

  it('flatMap encadena y cortocircuita en el primer fallo', () => {
    const parse = (s: string) => (/^\d+$/.test(s) ? ok(Number(s)) : err('no es numero'));
    expect(flatMap(ok('42'), parse)).toEqual({ ok: true, value: 42 });
    expect(flatMap(ok('x'), parse)).toEqual({ ok: false, error: 'no es numero' });
  });

  it('mapErr traduce el error entre capas sin tocar el valor', () => {
    expect(mapErr(err({ kind: 'Low' }), (e) => `${e.kind}!`)).toEqual({ ok: false, error: 'Low!' });
    expect(mapErr(ok(1), () => 'nunca')).toEqual({ ok: true, value: 1 });
  });

  it('combine corta en el primer error, no acumula', () => {
    expect(combine([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
    expect(combine([ok(1), err('primera'), err('segunda')])).toEqual({
      ok: false,
      error: 'primera',
    });
  });

  it('unwrap lanza sobre un Err, para que un fallo nunca pase inadvertido en tests', () => {
    expect(unwrap(ok('bien'))).toBe('bien');
    expect(() => unwrap(err({ kind: 'Roto' }))).toThrow(/Roto/);
  });

  it('unwrapOr devuelve el sustituto sin lanzar', () => {
    expect(unwrapOr(ok('bien'), 'defecto')).toBe('bien');
    expect(unwrapOr(err('boom'), 'defecto')).toBe('defecto');
  });
});
