import { ok, err, can, asId, type Result, type CustomerId } from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: archivar un cliente o devolverlo a la lista.
 *
 * NO existe "eliminar", y la ausencia es deliberada. Un cliente con notas de entrega
 * emitidas no se puede borrar sin dejar documentos apuntando al vacio, y el dia que
 * alguien tenga que explicar una venta de hace ocho meses va a necesitar saber a quien
 * se la hizo. Archivar lo saca de los desplegables y del listado, que es lo que de
 * verdad se quiere cuando alguien dice "borralo": dejar de verlo.
 *
 * Es reversible a proposito. Un archivado por error se deshace en un clic; un borrado
 * por error se deshace con una copia de seguridad, si la hay.
 */

export interface SetCustomerStatusInput {
  readonly customerId: string;
  readonly archived: boolean;
}

export type SetCustomerStatusError =
  { kind: 'Forbidden' } | { kind: 'CustomerNotFound'; customerId: string };

export interface SetCustomerStatusDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeSetCustomerStatus(deps: SetCustomerStatusDeps) {
  return async function setCustomerStatus(
    input: SetCustomerStatusInput,
  ): Promise<Result<{ archived: boolean }, SetCustomerStatusError>> {
    if (!can(deps.ctx.actor, 'customer:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const customer = await repos.customers.findById(asId<CustomerId>(input.customerId));
      if (!customer) return err({ kind: 'CustomerNotFound', customerId: input.customerId });

      if (input.archived) {
        const archived = customer.archive(deps.clock.now());
        if (!archived.ok) return err({ kind: 'CustomerNotFound', customerId: input.customerId });
      } else {
        customer.restore();
      }

      await repos.customers.save(customer);
      await repos.audit.record({
        action: input.archived ? 'customer.archived' : 'customer.restored',
        entityType: 'customer',
        entityId: customer.id,
        summary: { code: customer.code, name: customer.name },
      });

      return ok({ archived: input.archived });
    });
  };
}
