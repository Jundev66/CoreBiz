import { ok, err, can, type Result } from '@corebiz/domain';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Use case: record that someone took the audit log away.
 *
 * EXPORTING THE WHOLE LOG LEFT NO TRACE. Every create, correction and void was logged, but
 * downloading who-did-what for the entire company — emails included — was not. Someone
 * could export a hundred times and the log would never know.
 *
 * That is not a formality: an audit log exists to reconstruct what happened, and "someone
 * took a copy on the 4th" is part of what happened. With several people per company it is
 * also the only way to tell where the data left from if it ever shows up outside.
 *
 * IT IS A WRITE even though the export is a read, which is why it lives here and not in
 * the controller: `can()` decides whether it is allowed, and the unit of work guarantees
 * the row carries the right actor and instant. A controller writing audit rows on its own
 * is exactly how rules start being bypassed.
 *
 * It checks `audit:export` rather than `audit:read`, the same permission the download
 * route requires. If it were missing the download would already have been rejected; the
 * check is repeated because a use case does not assume someone else checked for it.
 *
 * The row count goes into the summary. It is what separates "took three lines from March"
 * from "took the entire history", and it costs nothing to keep.
 */

export interface RecordAuditExportInput {
  readonly rowCount: number;
  /** The filters the export was requested with, as applied. */
  readonly filters?: Readonly<Record<string, string>>;
}

export type RecordAuditExportError = { kind: 'Forbidden' };

export interface RecordAuditExportDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
}

export function makeRecordAuditExport(deps: RecordAuditExportDeps) {
  return async function recordAuditExport(
    input: RecordAuditExportInput,
  ): Promise<Result<void, RecordAuditExportError>> {
    if (!can(deps.ctx.actor, 'audit:export')) {
      return err({ kind: 'Forbidden' });
    }

    await deps.uow.run(async (repos) => {
      await repos.audit.record({
        action: 'audit.exported',
        entityType: 'tenant',
        entityId: deps.ctx.tenantId,
        summary: {
          rows: input.rowCount,
          ...(input.filters !== undefined ? input.filters : {}),
        },
      });
    });

    return ok(undefined);
  };
}
