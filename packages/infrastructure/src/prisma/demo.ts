import { randomBytes } from 'node:crypto';
import { getPrisma } from '@corebiz/db';

/**
 * Provision y control del sandbox de demostracion.
 *
 * Estas funciones NO pasan por el Unit of Work ni establecen contexto de tenant,
 * y no es un descuido: se ejecutan ANTES de que exista el tenant que van a
 * crear. Corren con el rol de la API, `corebiz_api`, which cannot bypass row-level
 * security: every read and write here goes through a `SECURITY DEFINER` function it was
 * granted by name, revoked from `public`, `anon` and `authenticated`, so no user session
 * can call them either.
 */

/** El estado del presupuesto de infraestructura. */
export type DemoMode = 'normal' | 'degraded' | 'critical';

export interface DemoCapacity {
  readonly mode: DemoMode;
  readonly usedBytes: number;
  /** Fraccion del presupuesto consumida, entre 0 y 1. */
  readonly ratio: number;
  readonly activeSandboxes: number;
}

/**
 * Cuanto espacio queda y en que modo hay que operar.
 *
 * Se consulta ANTES de clonar, no despues. Preguntar despues seria enterarse de
 * que no cabia cuando ya no cabe.
 */
export async function demoCapacity(url: string, budgetBytes = 500_000_000): Promise<DemoCapacity> {
  const rows = await getPrisma(url).$queryRaw<
    {
      mode: string;
      used_bytes: string | number;
      ratio: string | number;
      active_sandboxes: number;
    }[]
  >`select * from app.demo_capacity(${budgetBytes})`;

  const row = rows[0];

  if (row === undefined) {
    // Sin lectura no se puede saber si cabe. Se asume que no: quedarse sin
    // espacio es irreversible en el acto; servir el modo degradado no lo es.
    return { mode: 'critical', usedBytes: 0, ratio: 1, activeSandboxes: 0 };
  }

  return {
    mode: row.mode === 'critical' || row.mode === 'degraded' ? row.mode : 'normal',
    usedBytes: Number(row.used_bytes),
    ratio: Number(row.ratio),
    activeSandboxes: Number(row.active_sandboxes),
  };
}

/** Las credenciales desechables con las que el visitante entra a su sandbox. */
export interface DemoCredentials {
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  readonly expiresAt: Date;
  /**
   * True cuando no cabia otra copia y se entrego acceso de SOLO LECTURA sobre la
   * plantilla compartida.
   *
   * La pantalla lo dice en voz alta en lugar de dejar que el visitante descubra
   * por su cuenta que los botones no hacen nada. Un sistema que parece roto es
   * peor que uno que explica su limite.
   */
  readonly readonly: boolean;
  /**
   * Why the visitor got a read-only seat, or null with their own copy.
   *
   * `capacity`: the space budget or the live-sandbox cap was reached. `limit`: the caller
   * forced it because this origin (or everyone, this hour) already created enough copies.
   * The screen explains each one differently: "the service is busy" is a lie when the real
   * reason is that the visitor's own network used its quota.
   */
  readonly readonlyReason: 'capacity' | 'limit' | null;
}

export type ProvisionDemoResult =
  ({ ok: true } & DemoCredentials) | { ok: false; reason: 'failed' | 'full' };

export interface ProvisionDemoOptions {
  readonly templateTenantId: string;
  readonly ipHash: string | null;
  readonly ttlHours: number;
  readonly maxConcurrent: number;
  readonly budgetBytes?: number;
  /** Read-only seats allowed per hour once capacity is exhausted. Unbounded when absent. */
  readonly maxReadonlyPerHour?: number;
  /**
   * Hand out a read-only seat even with room for a copy. The caller sets it when the
   * hourly copy quota (per origin or overall) is used up: degrade instead of refusing.
   */
  readonly forceReadonly?: boolean;
}

/**
 * Real sandbox COPIES created in the last `sinceSeconds`, per origin or overall.
 *
 * It counts `demo_sessions` rows of kind `sandbox`, not attempts. The previous limit
 * recorded every click before anything was created — failures and rejected tries included —
 * so one test from an office network locked everybody behind it out of the demo for an
 * hour, with a message promising "the demo you already have" that did not exist.
 *
 * Read-only seats (`viewer`) are excluded: they cost one row, not a database copy.
 *
 * `ipHash: undefined` counts every origin; `null` counts the rows stored without one.
 * Counting and creating are not atomic, so two simultaneous requests can overshoot by one;
 * the live-sandbox cap and the space breaker are the hard limits.
 */
export async function countRecentDemoSandboxes(
  url: string,
  options: { readonly ipHash?: string | null; readonly sinceSeconds: number },
): Promise<number> {
  // Through a bounded function, not a table read: the API's role cannot bypass row-level
  // security, and `demo_sessions` has no policy that would let it count.
  const anyOrigin = options.ipHash === undefined;
  const rows = await getPrisma(url).$queryRaw<{ n: number }[]>`
    select app.count_demo_sessions(
      'sandbox', ${options.sinceSeconds}::int, ${anyOrigin}, ${options.ipHash ?? null}::text
    ) as n
  `;

  return Number(rows[0]?.n ?? 0);
}

/**
 * Correo del visitante.
 *
 * `corebiz.demo` NO es un dominio real, y eso es deliberado: no existe buzon al
 * que mandar nada, asi que por mucho que se abuse del enlace este sistema no
 * puede convertirse en un emisor de correo hacia terceros. El precio es que la
 * cuenta hay que darla por confirmada al crearla, y por eso la funcion SQL
 * rellena `email_confirmed_at`.
 */
function demoEmail(): string {
  return `demo-${randomBytes(6).toString('hex')}@corebiz.demo`;
}

/**
 * Contrasena del visitante.
 *
 * `randomBytes` y no `Math.random`: la contrasena da acceso a un sandbox que
 * vive 24 horas, pero una generada con un PRNG predecible se puede adivinar
 * desde otra sesion, y entonces el aislamiento entre visitantes —lo unico que
 * esta pantalla promete— deja de existir.
 *
 * En base32 sin vocales para que se pueda copiar a mano de la pantalla al
 * gestor de contrasenas sin confundir un cero con una O.
 */
function demoPassword(): string {
  const alphabet = '23456789BCDFGHJKLMNPQRSTVWXZ';
  const bytes = randomBytes(16);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/**
 * Crea un visitante nuevo con su cuenta, su copia de la plantilla y sus
 * credenciales, todo en una transaccion.
 *
 * Solo hay dos desenlaces: entra —con su propio sandbox o, si no cabia, en solo
 * lectura— o algo fallo de verdad. Devuelve un resultado en lugar de lanzar
 * porque "no cabe" no es un error del sistema y no debe pintarse como tal.
 */
export async function provisionDemoSandbox(
  url: string,
  options: ProvisionDemoOptions,
): Promise<ProvisionDemoResult> {
  const capacity = await demoCapacity(url, options.budgetBytes);

  // Dos frenos independientes, y los dos hacen falta. El de espacio protege el
  // limite duro de la base; el de sandboxes vivos protege de que mil visitas en
  // una hora consuman en minutos lo que el de espacio tardaria en notar.
  //
  // Ninguno de los dos RECHAZA al visitante: lo degradan a solo lectura sobre la
  // plantilla compartida, que cuesta una fila. Devolver "vuelve mas tarde" en el
  // enlace de un CV es el peor resultado posible del proyecto entero, porque el
  // momento en que se abre es justo el que no se repite.
  const overCapacity =
    capacity.mode !== 'normal' || capacity.activeSandboxes >= options.maxConcurrent;
  const readonly = overCapacity || options.forceReadonly === true;
  const readonlyReason = overCapacity ? 'capacity' : readonly ? 'limit' : null;

  // Degraded mode still costs an account, an identity, a membership and a session per
  // call. Without a ceiling, rotating addresses kept creating them forever.
  if (readonly && options.maxReadonlyPerHour !== undefined) {
    const seats = await getPrisma(url).$queryRaw<{ n: number }[]>`
      select app.count_demo_sessions('viewer', 3600, true, null) as n
    `;
    if (Number(seats[0]?.n ?? 0) >= options.maxReadonlyPerHour) {
      return { ok: false, reason: 'full' };
    }
  }

  const email = demoEmail();
  const password = demoPassword();

  try {
    const rows = await getPrisma(url).$queryRaw<{ tenant_id: string; user_id: string }[]>`
      select out_tenant as tenant_id, out_user as user_id from app.provision_demo_session(
        ${options.templateTenantId}::uuid, ${email}, ${password},
        ${options.ipHash}, ${options.ttlHours}, ${readonly}
      )
    `;

    const row = rows[0];
    if (row === undefined) return { ok: false, reason: 'failed' };

    return {
      ok: true,
      tenantId: row.tenant_id,
      userId: row.user_id,
      email,
      password,
      expiresAt: new Date(Date.now() + options.ttlHours * 60 * 60 * 1000),
      readonly,
      readonlyReason,
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Comprueba que un sandbox sigue vivo.
 *
 * La caducidad ya la aplica `app.is_member()`, asi que un tenant vencido es
 * inaccesible EN EL ACTO sin esperar a la purga. Esta funcion existe para poder
 * afirmarlo en un test: que la medida de seguridad es la caducidad y no el cron.
 */
export async function demoSandboxIsAlive(url: string, tenantId: string): Promise<boolean> {
  const rows = await getPrisma(url).$queryRaw<{ alive: boolean }[]>`
    select app.demo_sandbox_is_alive(${tenantId}::uuid) as alive
  `;

  return rows[0]?.alive === true;
}

/** Purga los sandboxes caducados. La invoca el cron de respaldo. */
export async function purgeExpiredDemos(url: string): Promise<number> {
  const rows = await getPrisma(url).$queryRaw<
    { deleted: number }[]
  >`select app.purge_expired_demos() as deleted`;
  return Number(rows[0]?.deleted ?? 0);
}
