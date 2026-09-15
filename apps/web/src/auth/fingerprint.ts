import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { DEVELOPMENT_HASH_SECRET, requiredSecret } from './secrets';

/**
 * Where this request comes from, without actually knowing.
 *
 * The IP is used to rate-limit attempts and to trace audit rows, never to identify anyone,
 * so it is never stored in clear: it is hashed with a salt that rotates daily. That keeps
 * the one property needed — two requests from the same origin yield the same value within
 * the same day — and makes the trail useless after twenty-four hours.
 *
 * The salt includes a deployment secret besides the date: without it, anyone holding the
 * table could walk the IPv4 space and reverse the hashes, which is small enough for a
 * dictionary attack.
 *
 * The hash is COMPUTED HERE and not in the API, even though the counters and the audit log
 * live there. This is the only place where `x-forwarded-for` can be trusted: on Vercel the
 * platform sets it and it cannot be forged from outside. Computed on the other side of the
 * wire, the header would come from our own server and say whatever we told it.
 *
 * In production the secret is mandatory (`requiredSecret`). A missing value used to fall
 * back to a salt written in this repository, which made every stored hash reversible.
 *
 * It lives in its own module, with no project imports, because the API client needs it and
 * `request-identity.ts` imports `@/api/internal`, which imports the client: keeping it here
 * avoids an import cycle.
 */
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${requiredSecret('REQUEST_HASH_SECRET', DEVELOPMENT_HASH_SECRET)}:${day}`;
}

export async function clientFingerprint(): Promise<string> {
  const store = await headers();

  /*
   * The platform's own headers first. `x-vercel-forwarded-for` and `x-real-ip` are written by
   * Vercel and nothing a client sends survives into them. The first `x-forwarded-for` entry
   * is only as trustworthy as the host: Vercel overwrites it, but behind any other proxy a
   * client can prepend whatever it likes and walk past every login limit and demo quota.
   * It stays as the last resort for local development, where none of the others exist.
   */
  const ip =
    store.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    store.get('x-real-ip')?.trim() ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';

  return createHash('sha256').update(`${dailySalt()}:${ip}`).digest('hex').slice(0, 32);
}
