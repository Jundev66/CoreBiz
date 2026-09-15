/**
 * Where someone may be sent back to after a detour.
 *
 * Two screens receive their return target through the URL: the wait screen while the API
 * wakes up (`?next=`) and the email-link callback (`/auth/callback?next=`). Both used the
 * same check, which looked sufficient and was not:
 *
 *     target.startsWith('/') && !target.startsWith('//')
 *
 * `/\other-site.example` passes that filter — it starts with a slash and the second
 * character is not another slash — yet the browser resolves it as an absolute URL on
 * ANOTHER ORIGIN, because the URL spec treats a backslash like a slash for http and https,
 * and also strips tabs and newlines. Confirmed in a real browser:
 * `?next=/\127.0.0.1:3211/health` ended up off-site.
 *
 * That turns a link starting with the real CoreBiz domain into a redirector to wherever
 * its author wants, which is exactly what phishing needs to look legitimate.
 *
 * So the string is not inspected here: it is RESOLVED against a fake origin and the
 * result must still be on that origin. The decision is made by the same algorithm the
 * browser will use, not by an imitation of it. This covers `//host`, `/\host`,
 * `https://host`, `javascript:` (whose origin is `null`) and control-character variants.
 *
 * It ALWAYS returns a relative path, never an absolute URL, so nobody can pass the result
 * to an `href` believing it is internal.
 */

/**
 * An origin that does not exist and cannot match anything real.
 *
 * `.invalid` is reserved by RFC 2606 for exactly this: it never resolves and nobody can
 * register it. It is only used for comparison.
 */
const CONTROL_ORIGIN = 'https://corebiz.invalid';

/** The internal path to return to, or the root if what arrived cannot be trusted. */
export function safeInternalPath(target: string | null | undefined): string {
  if (typeof target !== 'string' || target === '') return '/';

  let resolved: URL;
  try {
    resolved = new URL(target, CONTROL_ORIGIN);
  } catch {
    // Not even a URL. Nothing to salvage.
    return '/';
  }

  // The check that matters: if resolving it changes the origin, the target was not
  // internal, however much it started with a slash.
  if (resolved.origin !== CONTROL_ORIGIN) return '/';

  /*
   * And the check that is NOT enough on its own. Dot segments are resolved above, so
   * `/.//evil.example` or `/%2e//evil.example` stay on the control origin yet come out as
   * `//evil.example` — a protocol-relative URL that `router.replace` and `href` send
   * off-site. A path may never start with two separators.
   */
  if (/^[\\/]{2}/.test(resolved.pathname)) return '/';

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
