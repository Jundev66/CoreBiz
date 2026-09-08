import {
  ok,
  err,
  can,
  asId,
  Supplier,
  type Result,
  type SupplierId,
  type SupplierError,
  type QuotaError,
  type FeatureError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { periodOf } from '../period';

/**
 * Caso de uso: dar de alta un proveedor.
 *
 * Sigue el mismo orden que el alta de cliente, con un paso mas al principio: el
 * modulo de compras entero esta reservado al plan PRO, y esa comprobacion va
 * ANTES que la de permisos.
 *
 * El orden importa para el mensaje. Con el gate despues, un vendedor de un plan
 * gratuito recibiria "no tienes permiso" cuando el problema real es que su
 * empresa no tiene contratado el modulo — y se pondria a pedirle permisos a su
 * jefe para algo que ningun permiso desbloquea.
 */

export interface CreateSupplierInput {
  readonly name: string;
  readonly taxId?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly contactName?: string | null;
  readonly notes?: string | null;
}

export type CreateSupplierError = { kind: 'Forbidden' } | FeatureError | QuotaError | SupplierError;

export interface CreateSupplierOutput {
  readonly id: string;
  readonly code: string;
}

export interface CreateSupplierDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeCreateSupplier(deps: CreateSupplierDeps) {
  return async function createSupplier(
    input: CreateSupplierInput,
  ): Promise<Result<CreateSupplierOutput, CreateSupplierError>> {
    const gate = deps.ctx.plan.checkFeature('purchasing');
    if (!gate.ok) return gate;

    if (!can(deps.ctx.actor, 'supplier:write')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      const used = await repos.usage.current('suppliers');
      const quota = deps.ctx.plan.checkQuota('suppliers', used);
      if (!quota.ok) return quota;

      // El codigo lo genera el sistema, igual que el de los clientes. El
      // correlativo se consume con bloqueo dentro de esta transaccion, asi que dos
      // altas simultaneas no pueden recibir el mismo.
      const code = await repos.sequences.next('supplier', periodOf(deps.clock.now()));

      const created = Supplier.create({
        id: asId<SupplierId>(deps.ids.next()),
        tenantId: deps.ctx.tenantId,
        code,
        name: input.name,
        taxId: input.taxId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        contactName: input.contactName ?? null,
        notes: input.notes ?? null,
        createdAt: deps.clock.now(),
      });
      if (!created.ok) return created;

      const supplier = created.value;

      await repos.suppliers.save(supplier);
      await repos.usage.increment('suppliers');
      await repos.audit.record({
        action: 'supplier.created',
        entityType: 'supplier',
        entityId: supplier.id,
        summary: { code: supplier.code, name: supplier.name },
      });

      return ok({ id: supplier.id, code: supplier.code });
    });
  };
}
