/**
 * What may appear inside a success notice.
 *
 * The "created successfully" toast is built from a URL value (`?creado=`), which allowed
 * arbitrary text inside the system's green box, with its icon and typography — a notice
 * saying something was issued when nothing was. It is not XSS (React escapes the text),
 * but it lends the application's official look to a message it did not write.
 *
 * It lives in its own module rather than in `toast.tsx` because that file is
 * `'use client'`: a pure function called by SERVER pages cannot cross that boundary.
 */

/**
 * Shape of every code the system assigns: `CLT26000009`, `NE-000006`, `PRV26000004` or a
 * SKU. No spaces, no sentences, no stray punctuation.
 */
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/**
 * The code if it is one, or `null` if what arrived does not look like a code.
 *
 * Takes `unknown` on purpose. The `searchParams` type promises `string | undefined`, but a
 * repeated parameter (`?creado=a&creado=b`) arrives as an ARRAY, which made next-intl
 * render the key path on screen (`customers.created`) and log `INVALID_MESSAGE`. One
 * filter closes both problems.
 */
export function noticeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  return CODE.test(trimmed) ? trimmed : null;
}
