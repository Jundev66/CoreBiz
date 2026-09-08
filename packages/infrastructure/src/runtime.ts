import { and, eq } from 'drizzle-orm';
import { getDatabase, schema } from '@corebiz/db';
import type {
  Clock,
  IdGenerator,
  ReadModels,
  TenantContext,
  UnitOfWork,
} from '@corebiz/application';
import { DrizzleUnitOfWork } from './drizzle/unit-of-work';
import { readOnly } from './drizzle/session';
import { drizzleReadModels } from './queries/read-models';

const { tenants, memberships } = schema;

/**
 * Punto de entrada del adaptador de Postgres.
 *
 * Existe para que el composition root de la aplicacion no tenga que conocer ni
 * Drizzle ni el esquema: pide un runtime con una URL y recibe los puertos ya
 * montados. Es lo que mantiene honesta la regla `ui-no-direct-db`.
 */

export interface PostgresRuntimeDeps {
  readonly url: string;
  readonly ctx: TenantContext;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface PostgresRuntime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
}

export function postgresRuntime(deps: PostgresRuntimeDeps): PostgresRuntime {
  const db = getDatabase(deps.url);

  return {
    uow: new DrizzleUnitOfWork({ db, ctx: deps.ctx, ids: deps.ids, clock: deps.clock }),
    queries: drizzleReadModels(db, deps.ctx, deps.clock),
  };
}

export interface TenantProfile {
  readonly slug: string;
  readonly planCode: string;
  readonly role: string;
  readonly isDemo: boolean;
  /** Cuando desaparece el tenant, o null si no caduca. Solo los sandboxes caducan. */
  readonly expiresAt: Date | null;
  readonly taxLabel: string;
  readonly taxRateBp: number;
  readonly baseCurrency: string;
  readonly exchangeRateScaled: bigint | null;
  readonly exchangeRateAt: Date | null;
}

/**
 * Carga el perfil del tenant y el rol del usuario dentro de el.
 *
 * Se lee de la base de datos en lugar de codificarse en la aplicacion para que
 * cambiar el plan o la tasa de cambio en una fila tenga efecto de inmediato. Si
 * estos valores vivieran en el codigo, la pantalla diria una cosa y las politicas
 * otra en cuanto alguien tocase la tabla.
 *
 * Devuelve null si el usuario no pertenece al tenant. Distinguir "no existe" de
 * "no tienes acceso" seria filtrar la existencia de empresas ajenas.
 */
export async function loadTenantProfile(
  url: string,
  ctx: TenantContext,
): Promise<TenantProfile | null> {
  const db = getDatabase(url);

  return readOnly(db, ctx, async (tx) => {
    const rows = await tx
      .select({ tenant: tenants, role: memberships.role })
      .from(tenants)
      .innerJoin(
        memberships,
        and(eq(memberships.tenantId, tenants.id), eq(memberships.userId, ctx.actor.userId)),
      )
      .where(and(eq(tenants.id, ctx.tenantId), eq(memberships.status, 'active')))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    return {
      slug: row.tenant.slug,
      planCode: row.tenant.planCode,
      role: row.role,
      isDemo: row.tenant.isDemo,
      expiresAt: row.tenant.expiresAt,
      taxLabel: row.tenant.taxLabel ?? 'Impuesto informativo',
      taxRateBp: row.tenant.taxRateBp,
      baseCurrency: row.tenant.baseCurrency,
      exchangeRateScaled: row.tenant.exchangeRateScaled,
      exchangeRateAt: row.tenant.exchangeRateAt,
    };
  });
}
