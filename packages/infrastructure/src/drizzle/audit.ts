import { schema } from '@corebiz/db';
import type {
  AuditEntry,
  AuditLogger,
  Clock,
  IdGenerator,
  TenantContext,
} from '@corebiz/application';
import type { Tx } from './tx';

const { auditLog } = schema;

/**
 * Registro de auditoria.
 *
 * Solo escribe. No expone lectura ni borrado, y la base de datos revoca UPDATE y
 * DELETE por GRANT ademas de por politica: una politica se puede sustituir con un
 * `create policy` posterior, un privilegio revocado es mas dificil de deshacer
 * por accidente. Un registro de auditoria que se puede editar no sirve de nada.
 *
 * Se escribe DENTRO de la misma transaccion que la operacion auditada. Si la
 * operacion se revierte, su rastro tambien: registrar algo que no llego a ocurrir
 * es tan enganoso como no registrar lo que ocurrio.
 */
export class DrizzleAuditLogger implements AuditLogger {
  constructor(
    private readonly tx: Tx,
    private readonly ctx: TenantContext,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.tx.insert(auditLog).values({
      // El puerto no lleva id: quien registra un hecho no deberia tener que
      // inventarle una clave. La pone el adaptador, que es quien sabe que la
      // tabla la necesita.
      id: this.ids.next(),
      tenantId: this.ctx.tenantId,
      actorId: this.ctx.actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary ?? null,
      diff: entry.diff ?? null,
      occurredAt: this.clock.now(),
    });
  }
}
