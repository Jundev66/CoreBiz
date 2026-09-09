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
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.tx.audit_log.create({
      data: {
        // El puerto no lleva id: quien registra un hecho no deberia tener que inventarle
        // una clave. La pone el adaptador, que es quien sabe que la tabla la necesita.
        id: this.ids.next(),
        tenant_id: this.ctx.tenantId,
        actor_id: this.ctx.actor.userId,
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
