import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-redirect';

/**
 * Every input here was either a real bypass or the obvious next thing to try.
 *
 * The dot-segment cases are the ones that got through: the URL parser resolves them and
 * stays on the control origin, but the path it hands back starts with `//`, which the
 * browser reads as another host.
 */
describe('safeInternalPath', () => {
  it.each([
    ['/.//evil.example/x'],
    ['/..//evil.example'],
    ['/%2e//evil.example'],
    ['/%2E%2E//evil.example'],
    ['/a/../..//evil.example'],
    ['/.\\/evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['https://evil.example/'],
    ['javascript:alert(1)'],
    ['/\t/evil.example'],
  ])('refuses %s', (target) => {
    const result = safeInternalPath(target);

    expect(result).toBe('/');
    expect(new URL(result, 'https://corebiz.test').origin).toBe('https://corebiz.test');
  });

  it.each([
    ['/customers', '/customers'],
    ['/customers?archivados=1', '/customers?archivados=1'],
    ['/delivery-notes/abc#print', '/delivery-notes/abc#print'],
    ['/reset-password', '/reset-password'],
  ])('keeps the internal path %s', (target, expected) => {
    expect(safeInternalPath(target)).toBe(expected);
  });

  it.each([[null], [undefined], ['']])('falls back to the root for %s', (target) => {
    expect(safeInternalPath(target)).toBe('/');
  });
});
