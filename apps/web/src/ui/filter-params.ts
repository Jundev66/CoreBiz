/**
 * Filters that arrive through the URL, sanitised before use.
 *
 * Filter forms are `method="get"` on purpose — a link to "what this person did in March"
 * must be bookmarkable and shareable — which makes their values UNTRUSTED INPUT, just like
 * a request body. No attack is needed: a typo in the address bar or an old link is enough.
 *
 * `/settings/audit?from=abc` took the whole screen down. `new Date('abc')` is an invalid
 * date, not an error, and the failure surfaced three layers below: the read client calls
 * `.toISOString()`, which throws `RangeError` on an invalid date. The result was the
 * framework's server error page, in English and without navigation.
 *
 * A repeated parameter (`?from=a&from=b`) arrives as an array, not a string — the same
 * family `noticeCode` already closed. That is why both functions check the type first.
 */

/** `YYYY-MM-DD`, which is what `<input type="date">` produces. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day, or nothing.
 *
 * Returns the STRING rather than a `Date` so the same value serves the three things the
 * screen needs: building the instant, refilling the field and rebuilding the export link.
 * A `Date` would have to be formatted back, which is where time-zone drift creeps in.
 *
 * The regex is not enough: `2026-02-31` matches it. Full ISO parsing is strict, so a day
 * that does not exist stays an invalid date and is dropped here.
 */
export function dayParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!DATE_ONLY.test(trimmed)) return null;

  return Number.isNaN(new Date(`${trimmed}T00:00:00.000Z`).getTime()) ? null : trimmed;
}

/**
 * A bounded text filter value.
 *
 * Truncated rather than rejected: the dropdown only offers real values, so anything else
 * will match nothing and the table comes back empty — the honest answer to "filter by
 * this". What must not happen is a 500-character parameter reaching the API, failing its
 * validation with a 400 and turning the screen into a server error again.
 */
export function textParam(raw: unknown, maxLength = 64): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed === '' ? null : trimmed;
}
