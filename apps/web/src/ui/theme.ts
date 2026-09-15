import { cookies } from 'next/headers';

/**
 * The colour theme, chosen per browser with the switch in the account area.
 *
 * It lives in a cookie and is read on the server, like the language: the page arrives
 * already painted in the right theme, with no flash and no inline script for the CSP to
 * allow. Anything other than the two known values falls back to light, so the attribute
 * written into `<html>` is never whatever a cookie happened to contain.
 */

export const THEME_COOKIE = 'corebiz_theme';

export type Theme = 'light' | 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export async function readTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : 'light';
}
