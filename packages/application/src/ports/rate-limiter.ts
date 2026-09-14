/**
 * Limitacion de peticiones.
 *
 * Es un puerto y no una utilidad porque quien decide CUANTO se permite es la
 * aplicacion, y quien decide DONDE se cuenta es la infraestructura. Separarlos
 * permite que los tests corran contra un contador en memoria y que produccion use
 * uno atomico en Postgres, sin que ninguna de las dos cosas se note aqui.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Intentos que quedan en la ventana actual. Cero no implica bloqueado todavia. */
  readonly remaining: number;
  /** Segundos hasta que la ventana se cierre. Va tal cual en `Retry-After`. */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /**
   * Registra un intento y dice si se admite.
   *
   * Cuenta SIEMPRE, tambien cuando ya se paso del limite: si dejara de contar al
   * bloquear, quien insiste sin parar renovaria la ventana en cuanto expirase y
   * el limite seria un bache en lugar de un muro.
   *
   * `bucket` identifica que se limita y a quien, y NUNCA lleva datos personales
   * en claro: la IP viaja como hash. Ver `docs/THREAT_MODEL.md`.
   */
  hit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}

/**
 * Politicas de limitacion, en un solo sitio.
 *
 * Estan aqui y no repartidas por las rutas porque son una decision de producto:
 * cuantos intentos de acceso es razonable que haga alguien que de verdad olvido
 * su contrasena, frente a cuantos necesita un ataque para servir de algo.
 *
 * Los numeros son deliberadamente generosos con la persona y tacanos con el
 * script: 8 intentos de acceso por minuto no molestan a nadie escribiendo mal su
 * clave, y hacen inviable recorrer un diccionario.
 */
export const RATE_LIMITS = {
  /** Acceso: por IP. El correo no entra en la clave, para no revelar si existe. */
  login: { limit: 8, windowSeconds: 60 },
  /** Registro: mas estricto, porque cada alta crea una empresa. */
  signup: { limit: 3, windowSeconds: 3_600 },
  /** Recuperacion: cada intento manda un correo, asi que se limita por hora. */
  passwordReset: { limit: 5, windowSeconds: 3_600 },
  /**
   * Demo sandbox COPIES per origin per hour. Counted from `demo_sessions`, not from hits:
   * the deployed value comes from `DEMO_MAX_PER_HOUR`; this is the default it mirrors.
   */
  demoSandbox: { limit: 3, windowSeconds: 3_600 },
  /**
   * Read-only demo seats per origin per hour, handed out once that origin's copy quota is
   * used up. Past it, and only then, the visitor is asked to come back later.
   */
  demoViewer: { limit: 10, windowSeconds: 3_600 },
  /**
   * Writes through the API, per verified user. The window lives here; the limit comes
   * from `API_WRITES_PER_HOUR` so a deployment can tune it without a release.
   */
  apiWrites: { limit: 600, windowSeconds: 3_600 },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

export type RateLimitPolicy = keyof typeof RATE_LIMITS;

/**
 * Contador en memoria.
 *
 * Sirve para los tests. NO sirve en produccion, y conviene
 * decir por que en voz alta: en serverless cada instancia de funcion tiene su
 * propio proceso, asi que diez instancias con "8 intentos cada una" son ochenta
 * intentos. Un limitador que no comparte estado no limita nada.
 */
export function inMemoryRateLimiter(now: () => Date = () => new Date()): RateLimiter {
  const buckets = new Map<string, { windowStart: number; hits: number }>();

  return {
    hit(bucket, limit, windowSeconds) {
      const seconds = Math.floor(now().getTime() / 1000);
      const windowStart = Math.floor(seconds / windowSeconds) * windowSeconds;

      const current = buckets.get(bucket);
      const entry =
        current !== undefined && current.windowStart === windowStart
          ? { windowStart, hits: current.hits + 1 }
          : { windowStart, hits: 1 };

      buckets.set(bucket, entry);

      return Promise.resolve({
        allowed: entry.hits <= limit,
        remaining: Math.max(0, limit - entry.hits),
        retryAfterSeconds: Math.max(1, windowStart + windowSeconds - seconds),
      });
    },
  };
}
