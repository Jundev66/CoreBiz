import type { PrismaClient } from '@corebiz/prisma-client';
import type {
  AdminQueries,
  AuditEntryView,
  AuditFilter,
  Page,
  PendingInvitationView,
  TeamMemberView,
  TenantContext,
} from '@corebiz/application';
import { readOnly } from '../prisma/session';
import { pageLimit } from '../prisma/pagination';

/**
 * Lado de LECTURA del modulo de administracion.
 *
 * El registro de auditoria no necesitaria filtro de tenant explicito: su politica RLS
 * exige `app.is_admin()` ademas del tenant, asi que un vendedor que llegase hasta aqui
 * —invocando la accion a mano— recibe cero filas de la base de datos, no de un `if` de la
 * pantalla.
 *
 * Aun asi el filtro va puesto. Duplicarlo no cuesta nada y protege del dia en que esta
 * consulta se ejecute desde un contexto sin politicas.
 *
 * Los nombres de modelo y columna van en snake_case porque el esquema se INTROSPECCIONA
 * de Supabase, que es quien manda. Renombrarlos a mano en `schema.prisma` obligaria a
 * mantener un `@map` por columna y a repasarlos en cada `db pull`. La traduccion a los
 * nombres del dominio ocurre aqui, que es para lo que existe un adaptador.
 */
class PrismaAdminQueries implements AdminQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  team(): Promise<readonly TeamMemberView[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      // `app.tenant_members()` y no un join directo: `authenticated` no puede leer
      // `auth.users`, y darle permiso expondria los correos y los hashes de todo el
      // proyecto. La funcion devuelve solo el equipo de la empresa activa y solo el
      // correo.
      const rows = await tx.$queryRaw<
        { user_id: string; email: string | null; role: string; created_at: string | Date }[]
      >`select * from app.tenant_members()`;

      return rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        role: row.role,
        joinedAt: new Date(row.created_at),
        // Marca a quien esta mirando para que la pantalla no le ofrezca expulsarse a si
        // mismo.
        isYou: row.user_id === this.ctx.actor.userId,
      }));
    });
  }

  pendingInvitations(): Promise<readonly PendingInvitationView[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const rows = await tx.invitations.findMany({
        select: { id: true, email: true, role: true, expires_at: true },
        where: {
          tenant_id: this.ctx.tenantId,
          accepted_at: null,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        orderBy: { created_at: 'desc' },
      });

      // El token no aparece por ningun lado, ni siquiera su hash: una pantalla no
      // necesita nada de eso, y lo que no viaja no se filtra.
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expires_at,
      }));
    });
  }

  auditLog(filter: AuditFilter): Promise<Page<AuditEntryView>> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const limit = pageLimit(filter.limit ?? 50);
      const offset = filter.cursor !== undefined ? Number(filter.cursor) : 0;

      const occurred: { gte?: Date; lte?: Date } = {};
      if (filter.from !== undefined) occurred.gte = filter.from;
      if (filter.to !== undefined) occurred.lte = filter.to;

      // OFFSET y no keyset, a diferencia del resto del sistema. Es una excepcion
      // consciente: el visor de auditoria se navega saltando a una fecha, no avanzando
      // pagina a pagina, y el volumen esta acotado por el filtro temporal. Con keyset
      // habria que arrastrar un cursor compuesto por cada combinacion de filtros, y no
      // compensa.
      const rows = await tx.audit_log.findMany({
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.action !== undefined && filter.action !== '' ? { action: filter.action } : {}),
          ...(filter.actorEmail !== undefined && filter.actorEmail !== ''
            ? { actor_email: filter.actorEmail }
            : {}),
          ...(Object.keys(occurred).length > 0 ? { occurred_at: occurred } : {}),
        },
        orderBy: { occurred_at: 'desc' },
        take: limit + 1,
        skip: offset,
      });

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;

      return {
        items: visible.map((row): AuditEntryView => ({
          id: row.id,
          occurredAt: row.occurred_at,
          actorEmail: row.actor_email,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          summary: row.summary as Readonly<Record<string, unknown>> | null,
        })),
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    });
  }

  auditActions(): Promise<readonly string[]> {
    return readOnly(this.prisma, this.ctx, async (tx) => {
      const rows = await tx.audit_log.findMany({
        distinct: ['action'],
        select: { action: true },
        where: { tenant_id: this.ctx.tenantId },
        orderBy: { action: 'asc' },
      });

      return rows.map((r) => r.action);
    });
  }
}

export function prismaAdminQueries(prisma: PrismaClient, ctx: TenantContext): AdminQueries {
  return new PrismaAdminQueries(prisma, ctx);
}
