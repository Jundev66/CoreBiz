import { and, desc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { schema, type Database } from '@corebiz/db';
import type {
  AdminQueries,
  AuditEntryView,
  AuditFilter,
  Page,
  PendingInvitationView,
  TeamMemberView,
  TenantContext,
} from '@corebiz/application';
import { readOnly } from '../drizzle/session';
import { pageLimit } from '../drizzle/pagination';

const { invitations, auditLog } = schema;

/**
 * Lado de LECTURA del modulo de administracion.
 *
 * El registro de auditoria no lleva filtro de tenant explicito en la consulta y
 * es correcto: su politica RLS exige `app.is_admin()` ademas del tenant, asi que
 * un vendedor que llegase hasta aqui —invocando la Server Action a mano— recibe
 * cero filas de la base de datos, no de un `if` de la pantalla.
 *
 * Aun asi el filtro va puesto. Duplicarlo no cuesta nada y protege del dia en
 * que esta consulta se ejecute desde un contexto sin politicas.
 */
class DrizzleAdminQueries implements AdminQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  team(): Promise<readonly TeamMemberView[]> {
    return readOnly(this.db, this.ctx, async (tx) => {
      // `app.tenant_members()` y no un join directo: `authenticated` no puede
      // leer `auth.users`, y darle permiso expondria los correos y los hashes de
      // todo el proyecto. La funcion devuelve solo el equipo de la empresa
      // activa y solo el correo.
      const rows = await tx.execute(sql`select * from app.tenant_members()`);

      return rows.map((raw) => {
        const row = raw as {
          user_id: string;
          email: string | null;
          role: string;
          created_at: string | Date;
        };
        return {
          userId: row.user_id,
          email: row.email,
          role: row.role,
          joinedAt: new Date(row.created_at),
          // Marca a quien esta mirando para que la pantalla no le ofrezca
          // expulsarse a si mismo.
          isYou: row.user_id === this.ctx.actor.userId,
        };
      });
    });
  }

  pendingInvitations(): Promise<readonly PendingInvitationView[]> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.tenantId, this.ctx.tenantId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invitations.createdAt));

      // El token no aparece por ningun lado, ni siquiera su hash: una pantalla
      // no necesita nada de eso, y lo que no viaja no se filtra.
      return rows;
    });
  }

  auditLog(filter: AuditFilter): Promise<Page<AuditEntryView>> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const limit = pageLimit(filter.limit ?? 50);
      const offset = filter.cursor !== undefined ? Number(filter.cursor) : 0;

      const conditions = [eq(auditLog.tenantId, this.ctx.tenantId)];
      if (filter.action !== undefined && filter.action !== '') {
        conditions.push(eq(auditLog.action, filter.action));
      }
      if (filter.actorEmail !== undefined && filter.actorEmail !== '') {
        conditions.push(eq(auditLog.actorEmail, filter.actorEmail));
      }
      if (filter.from !== undefined) conditions.push(gte(auditLog.occurredAt, filter.from));
      if (filter.to !== undefined) conditions.push(lte(auditLog.occurredAt, filter.to));

      // OFFSET y no keyset, a diferencia del resto del sistema. Es una excepcion
      // consciente: el visor de auditoria se navega saltando a una fecha, no
      // avanzando pagina a pagina, y el volumen esta acotado por el filtro
      // temporal. Con keyset habria que arrastrar un cursor compuesto por cada
      // combinacion de filtros, y no compensa.
      const rows = await tx
        .select()
        .from(auditLog)
        .where(and(...conditions))
        .orderBy(desc(auditLog.occurredAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;

      return {
        items: visible.map((row): AuditEntryView => ({
          id: row.id,
          occurredAt: row.occurredAt,
          actorEmail: row.actorEmail,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          summary: row.summary as Readonly<Record<string, unknown>> | null,
        })),
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    });
  }

  auditActions(): Promise<readonly string[]> {
    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .selectDistinct({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.tenantId, this.ctx.tenantId))
        .orderBy(auditLog.action);

      return rows.map((r) => r.action);
    });
  }
}

export function drizzleAdminQueries(db: Database, ctx: TenantContext): AdminQueries {
  return new DrizzleAdminQueries(db, ctx);
}
