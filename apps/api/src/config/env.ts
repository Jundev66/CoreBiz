import { z } from 'zod';

/**
 * The environment is validated AT STARTUP, not the first time someone reads it.
 *
 * The alternative — reading `process.env` wherever needed — turns a misconfigured variable
 * into a failure that shows up ten minutes later, in a visitor's request and with a message
 * about something else. Here the application refuses to build and says exactly what is
 * missing, both in the long-lived process and in the Vercel function.
 */

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /**
     * Whether to publish the OpenAPI document, and by default NO.
     *
     * It used to be decided by `NODE_ENV !== 'production'`, which fails on the dangerous
     * side: `NODE_ENV` defaults to `development`, and the `docs` route is permanently
     * excluded from the auth middleware. A deployment that forgot `NODE_ENV` would publish the
     * whole `/docs-json` without a session, and nothing would turn red.
     *
     * An open OpenAPI document for an ERP is a free map of its entire write surface. So now
     * it has to be asked for by name, and forgetting it leaves it closed, which is the right
     * way to fail.
     */
    DOCS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /** Port of the long-lived process (`main.ts`). The Vercel function ignores it. */
    PORT: z.coerce.number().int().positive().default(3001),

    /**
     * `memory` levanta la API entera sin Postgres.
     *
     * Ya NO es una forma de usar el producto: existe solo como doble de prueba, para
     * que la suite E2E y BDD corra sin Docker. Por eso exige `ALLOW_MEMORY_DRIVER`,
     * que ponen la configuracion de Playwright y la de vitest, y nadie mas. Sin ese
     * permiso explicito el proceso se niega a arrancar, en lugar de servir datos
     * inventados haciendolos pasar por los de la empresa.
     */
    DATA_DRIVER: z.enum(['postgres', 'memory']).default('postgres'),

    /** Permiso explicito para el driver de pruebas. Solo lo pone la suite. */
    ALLOW_MEMORY_DRIVER: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform((value) => value === 'true' || value === '1'),

    /** Pooler de Supabase en modo transaccion (6543). */
    DATABASE_URL: z.string().min(1).optional(),

    /**
     * Pool size per process. Never one: with a single connection each transaction holds it
     * for its whole duration and everything else queues (the addendum of ADR 004). Ten for
     * the long-lived process; three on Vercel, where Fluid compute serves concurrent
     * requests per instance and several instances share the free pooler (ADR 011).
     */
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),

    /** Origen del proyecto de Supabase. Sin `NEXT_PUBLIC_`: aqui no hay navegador. */
    SUPABASE_URL: z.string().url().optional(),

    /**
     * Secreto compartido con apps/web para los endpoints internos.
     *
     * Sin el, `/internal/*` responde 404 en lugar de abrirse. Un endpoint que BORRA y
     * que se abre cuando falta configuracion es la peor de las dos opciones, y es
     * exactamente la regla que ya sigue `/api/cron/purge`.
     */
    INTERNAL_API_SECRET: z.string().min(16).optional(),

    /**
     * Con `false`, nadie puede crear una cuenta ni una empresa.
     *
     * Es un interruptor de ENTORNO y no un borrado, y esa es la decision: el flujo de
     * alta —cuenta, empresa, correlativos, membresia de propietario— sigue entero,
     * probado y desplegado. Lo que se cierra es la puerta, porque la demostracion se
     * enseña con los datos del sembrador y una cuenta que alguien cree por curiosidad
     * es un negocio vacio que nadie va a volver a mirar.
     *
     * Por defecto ABIERTO, como estaba: quien clone el repositorio y lo levante espera
     * poder registrarse. Se cierra donde se enseña.
     */
    SIGNUP_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    /** Con `false`, /demo deja de entregar credenciales. El interruptor de coste. */
    DEMO_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    DEMO_TTL_HOURS: z.coerce.number().int().positive().default(24),
    /** Cincuenta sandboxes de ~20 MB son el 6 % de los 500 MB del plan gratuito. */
    DEMO_MAX_CONCURRENT: z.coerce.number().int().positive().default(50),
    /**
     * Sandbox COPIES per origin per hour (each costs an account and a full copy of the demo
     * database). Three, not one: an office behind one public address is several recruiters,
     * and the old value of one — counted per click — locked all of them out. Past it the
     * visitor gets a read-only seat instead of an error. The E2E suite raises it because it
     * opens several visitors from the SAME machine to prove their sandboxes are isolated.
     */
    DEMO_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
    /**
     * Sandbox copies per hour across ALL origins. The per-origin quota alone is beaten by
     * rotating addresses; this bounds copies per hour for everyone, below the live cap.
     */
    DEMO_MAX_SANDBOXES_PER_HOUR: z.coerce.number().int().positive().default(30),
    /**
     * Read-only demo seats handed out per hour once sandbox capacity is exhausted.
     *
     * Degraded mode used to create an account, identity, membership and session on EVERY
     * request with nothing ever refusing, so rotating addresses kept filling auth tables.
     * Past this ceiling `/demo` answers "unavailable" instead.
     */
    DEMO_MAX_READONLY_PER_HOUR: z.coerce.number().int().positive().default(60),
    /** Writes per verified user per hour through the API. See `WriteThrottleGuard`. */
    API_WRITES_PER_HOUR: z.coerce.number().int().positive().default(600),
    /** Reads per verified user per minute, per API instance. See `ReadThrottleGuard`. */
    API_READS_PER_MINUTE: z.coerce.number().int().positive().default(1_200),
  })
  .superRefine((value, ctx) => {
    if (value.DATA_DRIVER === 'postgres' && value.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Falta DATABASE_URL. Arranca la base de datos con `pnpm db:start`.',
      });
    }

    // El driver de pruebas no se alcanza por descuido: hay que pedirlo por su nombre.
    if (value.DATA_DRIVER === 'memory' && !value.ALLOW_MEMORY_DRIVER) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATA_DRIVER'],
        message:
          'DATA_DRIVER=memory es solo para la suite de pruebas. Arranca la base de datos con `pnpm db:start` y deja DATA_DRIVER=postgres.',
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached !== null) return cached;

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion invalida:\n${detail}`);
  }

  cached = parsed.data;
  return cached;
}

/** Solo para los tests, que necesitan cambiar el entorno entre casos. */
export function resetEnv(): void {
  cached = null;
}
