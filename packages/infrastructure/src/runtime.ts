import { getPrisma } from '@corebiz/db';
import type {
  Clock,
  IdGenerator,
  ReadModels,
  TenantContext,
  UnitOfWork,
} from '@corebiz/application';
import { PrismaUnitOfWork } from './prisma/unit-of-work';
import type { AuditTrace } from './prisma/audit';
import { readOnly } from './prisma/session';
import { prismaReadModels } from './queries/read-models';

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
  /** Verified email, IP hash and user agent, for audit rows. */
  readonly trace?: AuditTrace;
}

export interface PostgresRuntime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
}

export function postgresRuntime(deps: PostgresRuntimeDeps): PostgresRuntime {
  const prisma = getPrisma(deps.url);

  return {
    uow: new PrismaUnitOfWork({
      prisma,
      ctx: deps.ctx,
      ids: deps.ids,
      clock: deps.clock,
      ...(deps.trace !== undefined ? { trace: deps.trace } : {}),
    }),
    queries: prismaReadModels(prisma, deps.ctx, deps.clock),
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
  const prisma = getPrisma(url);

  return readOnly(prisma, ctx, async (tx) => {
    // El join se pide como relacion filtrada: solo interesa la empresa si el usuario tiene
    // en ella una membresia ACTIVA. Pedirlo asi, y no en dos consultas, evita el hueco en
    // el que la membresia se revoca entre una y otra.
    const row = await tx.tenants.findFirst({
      where: {
        id: ctx.tenantId,
        memberships: { some: { user_id: ctx.actor.userId, status: 'active' } },
      },
      include: {
        memberships: {
          where: { user_id: ctx.actor.userId, status: 'active' },
          select: { role: true },
          take: 1,
        },
      },
    });

    const role = row?.memberships[0]?.role;
    if (row === null || role === undefined) return null;

    return {
      slug: row.slug,
      planCode: row.plan_code,
      role,
      isDemo: row.is_demo,
      expiresAt: row.expires_at,
      taxLabel: row.tax_label ?? 'Impuesto informativo',
      taxRateBp: row.tax_rate_bp,
      baseCurrency: row.base_currency,
      exchangeRateScaled: row.exchange_rate_scaled,
      exchangeRateAt: row.exchange_rate_at,
    };
  });
}
