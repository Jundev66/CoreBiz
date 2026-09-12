import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { DEVELOPMENT_HASH_SECRET, requiredSecret } from './secrets';

/**
 * Proof that this browser came through a password-recovery email, for THIS user.
 *
 * `updatePasswordAction` used to accept any signed-in session. The page comment said only
 * a recovery session could reach it, but nothing enforced that: whoever held a session —
 * a stolen cookie, a shared counter left signed in — could set a new password without
 * knowing the old one, turning a temporary session into a permanent account takeover.
 *
 * `/auth/callback` sets this marker right after exchanging a recovery code, and the
 * action requires it. The value is an HMAC over the user id and an expiry, so it cannot
 * be copied from one account to another: an attacker who completes a recovery for their
 * OWN account and then swaps in a victim's session cookie still fails the check, because
 * the signature does not match the victim's id.
 *
 * Ten minutes, httpOnly, and cleared once the password changes.
 */

export const RECOVERY_COOKIE = 'corebiz_recovery';

const MAX_AGE_SECONDS = 10 * 60;

function signature(userId: string, expiresAt: number): Buffer {
  const key = requiredSecret('REQUEST_HASH_SECRET', DEVELOPMENT_HASH_SECRET);
  // Domain-separated: the same secret salts IP hashes, and a value from one purpose must
  // never verify as the other.
  return createHmac('sha256', key).update(`password-recovery:${userId}:${expiresAt}`).digest();
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function markRecovery(userId: string): Promise<void> {
  const expiresAt = nowInSeconds() + MAX_AGE_SECONDS;
  const value = `${expiresAt}.${signature(userId, expiresAt).toString('base64url')}`;

  (await cookies()).set(RECOVERY_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function hasRecovery(userId: string): Promise<boolean> {
  const raw = (await cookies()).get(RECOVERY_COOKIE)?.value;
  if (raw === undefined) return false;

  const [expiresRaw, providedRaw] = raw.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || expiresAt < nowInSeconds() || providedRaw === undefined) {
    return false;
  }

  const expected = signature(userId, expiresAt);
  const provided = Buffer.from(providedRaw, 'base64url');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function clearRecovery(): Promise<void> {
  try {
    (await cookies()).delete(RECOVERY_COOKIE);
  } catch {
    // Server Component render: nothing to clear from here.
  }
}
