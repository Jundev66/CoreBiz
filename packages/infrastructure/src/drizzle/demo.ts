import { sql } from 'drizzle-orm';
import { getDatabase } from '@corebiz/db';

/**
 * Provision y control del sandbox de demostracion.
 *
 * Estas funciones NO pasan por el Unit of Work ni establecen contexto de tenant,
 * y no es un descuido: se ejecutan ANTES de que exista el tenant que van a
 * crear. Corren como el rol de la conexion —propietario de las funciones
 * `SECURITY DEFINER` de abajo— y esas funciones estan revocadas de `public`, asi
 * que no hay forma de invocarlas desde una sesion de usuario.
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
  const rows = await getDatabase(url).execute(sql`select * from app.demo_capacity(${budgetBytes})`);

  const row = rows[0] as
    | {
        mode: string;
        used_bytes: string | number;
        ratio: string | number;
        active_sandboxes: number;
      }
    | undefined;

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

export type ProvisionDemoResult =
  { ok: true; tenantId: string } | { ok: false; reason: 'degraded' | 'at_capacity' | 'failed' };

export interface ProvisionDemoOptions {
  readonly templateTenantId: string;
  readonly ipHash: string | null;
  readonly ttlHours: number;
  readonly maxConcurrent: number;
  readonly budgetBytes?: number;
}

/**
 * Crea un sandbox para un visitante nuevo.
 *
 * Devuelve un motivo en lugar de lanzar cuando no se puede: la diferencia entre
 * "no cabe" y "fallo algo" decide lo que ve el visitante, y son dos pantallas
 * distintas. En el primer caso se le sirve la plantilla en solo lectura y no se
 * entera de nada; en el segundo hay que decirle que lo intente luego.
 */
export async function provisionDemoSandbox(
  url: string,
  options: ProvisionDemoOptions,
): Promise<ProvisionDemoResult> {
  const capacity = await demoCapacity(url, options.budgetBytes);

  // Dos frenos independientes, y los dos hacen falta. El de espacio protege el
  // limite duro de la base; el de sandboxes vivos protege de que mil visitas en
  // una hora consuman en minutos lo que el de espacio tardaria en notar.
  if (capacity.mode !== 'normal') return { ok: false, reason: 'degraded' };
  if (capacity.activeSandboxes >= options.maxConcurrent) {
    return { ok: false, reason: 'at_capacity' };
  }

  try {
    const rows = await getDatabase(url).execute(sql`
      select app.clone_demo_tenant(
        ${options.templateTenantId}::uuid, ${options.ipHash}, ${options.ttlHours}
      ) as tenant_id
    `);

    const tenantId = (rows[0] as { tenant_id: string } | undefined)?.tenant_id;
    return tenantId === undefined ? { ok: false, reason: 'failed' } : { ok: true, tenantId };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Comprueba que un sandbox sigue vivo.
 *
 * Se llama en cada request que trae la cookie del sandbox. Un tenant caducado ya
 * es inaccesible por `app.is_member()`, pero saberlo AQUI permite ofrecer uno
 * nuevo en lugar de mostrar una aplicacion vacia sin explicacion.
 */
export async function demoSandboxIsAlive(url: string, tenantId: string): Promise<boolean> {
  const rows = await getDatabase(url).execute(sql`
    select 1
      from public.tenants
     where id = ${tenantId}::uuid
       and is_demo
       and (expires_at is null or expires_at > now())
  `);

  return rows.length > 0;
}

/** Purga los sandboxes caducados. La invoca el cron de respaldo. */
export async function purgeExpiredDemos(url: string): Promise<number> {
  const rows = await getDatabase(url).execute(sql`select app.purge_expired_demos() as deleted`);
  return Number((rows[0] as { deleted: number } | undefined)?.deleted ?? 0);
}
