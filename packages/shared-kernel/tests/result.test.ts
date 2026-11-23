import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  mapErr,
  combine,
  unwrap,
  unwrapOr,
} from '../src/result';

describe('Result', () => {
  it('distinguishes success from failure without throwing', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('failure'))).toBe(true);
  });

  it('map transforms value and preserves error', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(map(err('failure'), (n: number) => n * 3)).toEqual({ ok: false, error: 'failure' });
  });

  it('flatMap chains and short-circuits on first failure', () => {
    const parse = (s: string) => (/^\d+$/.test(s) ? ok(Number(s)) : err('not a number'));
    expect(flatMap(ok('42'), parse)).toEqual({ ok: true, value: 42 });
    expect(flatMap(ok('x'), parse)).toEqual({ ok: false, error: 'not a number' });
  });

  it('mapErr translates error without touching value', () => {
    expect(mapErr(err({ kind: 'Low' }), (e) => `${e.kind}!`)).toEqual({ ok: false, error: 'Low!' });
    expect(mapErr(ok(1), () => 'never')).toEqual({ ok: true, value: 1 });
  });

  it('combine aborts on first error without accumulating', () => {
    expect(combine([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
    expect(combine([ok(1), err('first'), err('second')])).toEqual({
      ok: false,
      error: 'first',
    });
  });

  it('unwrap throws on Err', () => {
    expect(unwrap(ok('valid'))).toBe('valid');
    expect(() => unwrap(err({ kind: 'Broken' }))).toThrow(/Broken/);
  });

  it('unwrapOr returns fallback on Err', () => {
    expect(unwrapOr(ok('valid'), 'default')).toBe('valid');
    expect(unwrapOr(err('failure'), 'default')).toBe('default');
  });
});
