import type {
  AuditEntry,
  AuditLogger,
  Clock,
  IdGenerator,
  TenantContext,
} from '@corebiz/application';
import { Prisma } from '@corebiz/prisma-client';
import type { Tx } from './session';

/**
 * Who acted, beyond their id.
 *
 * The three columns have existed since the first migration, are filtered on and exported —
 * and NOTHING WROTE THEM. The effect was twofold and silent: filtering by actor email could
 * never match, and the CSV "actor" column was always empty. An audit log that does not say
 * who did each thing is not an audit log, it is a list of actions.
 *
 * Where each value comes from, and what it is worth:
 *
 *   `actorEmail` — from the ALREADY VERIFIED TOKEN. The only one of the three that cannot
 *   be invented, which is why it is the one shown on screen and in the CSV.
 *
 *   `ipHash` — computed by the web tier, the only place where `x-forwarded-for` can be
 *   trusted (on Vercel the platform sets it). Never the IP in clear: SHA-256 with a salt
 *   that rotates daily, so two requests from the same origin match within the day and after
 *   twenty-four hours the trail no longer identifies anyone.
 *
 *   `userAgent` — what the browser says about itself, forwarded by the web.
 *
 * The last two arrive as headers, so whoever calls the API DIRECTLY can put anything in
 * them. They are recorded anyway — for a normal session they are accurate — but when
 * reading a row the firm facts are `actor_id`, then `actor_email`. Stated here so nobody
 * reads them as evidence.
 */
export interface AuditTrace {
  readonly actorEmail?: string | null;
  readonly ipHash?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Registro de auditoria.
 *
 * Solo escribe. No expone lectura ni borrado, y la base de datos revoca UPDATE y DELETE
 * por GRANT ademas de por politica: una politica se puede sustituir con un `create policy`
 * posterior, un privilegio revocado es mas dificil de deshacer por accidente. Un registro
 * de auditoria que se puede editar no sirve de nada.
 *
 * Se escribe DENTRO de la misma transaccion que la operacion auditada. Si la operacion se
 * revierte, su rastro tambien: registrar algo que no llego a ocurrir es tan enganoso como
 * no registrar lo que ocurrio.
 */
export class PrismaAuditLogger implements AuditLogger {
  constructor(
    private readonly tx: Tx,
    private readonly ctx: TenantContext,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly trace: AuditTrace = {},
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.tx.audit_log.create({
      data: {
        // El puerto no lleva id: quien registra un hecho no deberia tener que inventarle
        // una clave. La pone el adaptador, que es quien sabe que la tabla la necesita.
        id: this.ids.next(),
        tenant_id: this.ctx.tenantId,
        actor_id: this.ctx.actor.userId,
        // `?? null` rather than the bare value: Prisma omits `undefined`, and the column
        // would get its default instead of NULL. Same trap as `summary`, below.
        actor_email: this.trace.actorEmail ?? null,
        ip_hash: this.trace.ipHash ?? null,
        // Truncated: a user agent is free text chosen by the caller, and the table is no
        // place for kilobytes per row.
        user_agent: this.trace.userAgent?.slice(0, 400) ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        // Dos cosas que el driver anterior resolvia solo y aqui hay que decir:
        //
        // 1. Prisma OMITE los campos `undefined`, asi que dejarlo pasar escribiria el
        //    valor por defecto de la columna en lugar de NULL.
        // 2. En una columna JSON, `null` a secas escribe el valor JSON `null`.
        //    `Prisma.DbNull` escribe NULL de SQL, que es lo que significaba antes.
        summary:
          entry.summary === undefined || entry.summary === null
            ? Prisma.DbNull
            : (entry.summary as Prisma.InputJsonValue),
        diff:
          entry.diff === undefined || entry.diff === null
            ? Prisma.DbNull
            : (entry.diff as Prisma.InputJsonValue),
        occurred_at: this.clock.now(),
      },
    });
  }
}
