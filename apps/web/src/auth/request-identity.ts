import 'server-only';
import { inMemoryRateLimiter } from '@corebiz/application/ports';
import { callInternal, InternalCallFailed } from '@/api/internal';

/*
 * The origin hash moved to `./fingerprint` and is re-exported here so existing importers
 * keep working. The move breaks a CYCLE: the API client also needs the hash — it sends it
 * as a header for audit rows — and this file imports `@/api/internal`, which imports the
 * client. A module depending only on `node:crypto` and request headers cannot be in a cycle.
 */
export { clientFingerprint } from './fingerprint';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

/**
 * The counter used while the API does not answer. One per web instance.
 *
 * It does not replace the shared counter — several instances each keep their own — but it
 * turns "unlimited" into "limited per instance" for exactly the moments an attacker can
 * produce on purpose: flood the API until the internal call times out, then try passwords.
 */
const fallbackLimiter = inMemoryRateLimiter();

/**
 * Registra un intento y dice si se admite.
 *
 * El contador vive en la API porque necesita Postgres: una ventana por proceso no
 * limita nada cuando hay varias instancias sirviendo, y en Vercel cada invocacion
 * puede ser un proceso nuevo.
 *
 * IF THE API DOES NOT ANSWER, the attempt is counted in this instance instead. Failing
 * closed would make the sign-in form unusable during a cold start or a transient outage;
 * failing open, as it used to, let anyone who could slow the API down switch every login,
 * signup and reset limit off. The local counter keeps the form usable for a person and
 * still stops a dictionary.
 */
export async function hitRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  try {
    return await callInternal<RateLimitDecision>('/rate-limits', { bucket, limit, windowSeconds });
  } catch (error) {
    if (error instanceof InternalCallFailed) {
      /*
       * A MISCONFIGURED secret in production — unset, or different between the two Vercel
       * projects — used to fail open too, which silently turned off every login, signup and
       * reset limit with nothing but a warning in the log. That never fixes itself, so it
       * fails closed instead: sign-in stops working loudly and someone looks at the
       * configuration.
       */
      if (error.reason === 'misconfigured' && process.env.NODE_ENV === 'production') {
        console.error(
          '[rate-limit] internal secret missing or rejected; attempt refused:',
          error.message,
        );
        return { allowed: false, retryAfterSeconds: 60 };
      }
      console.warn(
        '[rate-limit] the API did not answer; counting in this instance:',
        error.message,
      );
      const local = await fallbackLimiter.hit(bucket, limit, windowSeconds);
      return local.allowed
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: local.retryAfterSeconds };
    }
    throw error;
  }
}
