import { cookies } from 'next/headers';
import { INCIDENT_ID_PATTERN, parseLastFailure, type LastFailure } from '@corebiz/contracts';

/**
 * The last thing that went wrong for this person.
 *
 * It exists so the help panel knows what it is being asked about without every screen
 * having to pass it along. It lives here rather than in `client.ts` because it has two
 * ends — writer and reader — and hiding one half inside the HTTP client would force the
 * panel to import the HTTP client just to read a cookie.
 *
 * Who writes, in order of importance:
 *
 *  1. `send()`, when the API rejects a write. One line there covers EVERY error coming
 *     from business rules, permissions and foreign ids, on every screen at once.
 *  2. Server Actions that reject BEFORE calling the API. Most are field-shape errors,
 *     already shown next to their input; the two that are not live in
 *     `actions/sales.ts`. Those have to be remembered by hand, which is why
 *     `check:playbooks` also scans `src/actions`.
 *
 * Who clears it, besides a successful write: signing out, switching company, and a
 * field-shape rejection (`formRejection`). The cookie belongs to the BROWSER, not to the
 * person or the company, and on a shared counter the next person must not find the
 * previous one's error explained.
 */

export const LAST_ERROR_COOKIE = 'corebiz_last_error';

/** Five minutes: after that, what failed is no longer what is being talked about. */
const MAX_AGE = 300;

/**
 * Records that something failed.
 *
 * The reference is validated on WRITE too, not only on read: whatever is stored here ends
 * up under the "Reference" label, which only admits what the API produces. An odd kind is
 * not filtered here; `parseLastFailure` drops it on read.
 *
 * Wrapped in `try/catch` because `cookies().set` THROWS during a Server Component render.
 * Writers are Server Actions and route handlers, where writing is allowed; the catch
 * exists so that, if that ever changes, the panel goes quiet instead of taking down the
 * screen it was trying to explain.
 */
export async function rememberFailure(
  kind: string,
  incidentId: string | number | null = null,
): Promise<void> {
  const reference =
    typeof incidentId === 'string' && INCIDENT_ID_PATTERN.test(incidentId) ? incidentId : null;

  try {
    (await cookies()).set(
      LAST_ERROR_COOKIE,
      JSON.stringify({ kind, incidentId: reference } satisfies LastFailure),
      {
        maxAge: MAX_AGE,
        // `httpOnly` stops JavaScript from READING it, not from creating it. Nothing in
        // the browser needs it — the panel is a Server Component — but that does not make
        // it trustworthy, which is why reading does not trust it.
        httpOnly: true,
        sameSite: 'lax',
        // Like every other cookie in the project. Without `secure` it would travel in
        // clear over any `http://` and a network attacker could plant it before HSTS
        // kicks in.
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    );
  } catch {
    // Server Component render: no cookies to write, and that is fine.
  }
}

/**
 * Clears the record.
 *
 * When something finally succeeds (otherwise the panel keeps explaining a solved problem
 * for five minutes), and on sign-out or company switch, when it stops belonging to whoever
 * is looking.
 */
export async function forgetFailure(): Promise<void> {
  try {
    (await cookies()).delete(LAST_ERROR_COOKIE);
  } catch {
    // Same as above.
  }
}

/** The last failure, if it is still unresolved. See `parseLastFailure`. */
export async function readLastFailure(): Promise<LastFailure | null> {
  const raw = (await cookies()).get(LAST_ERROR_COOKIE)?.value;
  return raw === undefined ? null : parseLastFailure(raw);
}
