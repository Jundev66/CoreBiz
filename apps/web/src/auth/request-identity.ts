import 'server-only';
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
 * Registra un intento y dice si se admite.
 *
 * El contador vive en la API porque necesita Postgres: una ventana por proceso no
 * limita nada cuando hay varias instancias sirviendo, y en Vercel cada invocacion
 * puede ser un proceso nuevo.
 *
 * SI LA API NO CONTESTA, se admite el intento. Es una decision incomoda y es la
 * correcta: fallar cerrado dejaria el formulario de acceso inutilizable durante el
 * arranque en frio de Render —un minuto en el que nadie podria entrar— para evitar
 * unos pocos intentos de mas en esa misma ventana. El limite protege de la fuerza
 * bruta, no de una avalancha, y una fuerza bruta que necesita que la API este caida
 * para pasar tiene un minuto al dia para intentarlo.
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
       * Open only when the API is merely UNREACHABLE (see above). A MISCONFIGURED secret
       * in production — unset on Vercel, or different from Render's — used to fail open
       * too, which silently turned off every login, signup and reset limit with nothing
       * but a warning in the log. That never fixes itself, so it fails closed instead:
       * sign-in stops working loudly and someone looks at the configuration.
       */
      if (error.reason === 'misconfigured' && process.env.NODE_ENV === 'production') {
        console.error(
          '[rate-limit] internal secret missing or rejected; attempt refused:',
          error.message,
        );
        return { allowed: false, retryAfterSeconds: 60 };
      }
      console.warn('[rate-limit] la API no respondio; se admite el intento:', error.message);
      return { allowed: true };
    }
    throw error;
  }
}
