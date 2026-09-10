import { ok, err, can, asId, type Result, type SupplierId } from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';

/**
 * Caso de uso: archivar un proveedor o devolverlo a la lista.
 *
 * Va detras del mismo gate PRO que el resto de compras, y el gate vive AQUI y no en la
 * ruta: una Server Action se puede invocar directamente, asi que un modulo protegido
 * solo por el enlace del menu no esta protegido.
 */

export interface SetSupplierStatusInput {
  readonly supplierId: string;
  readonly archived: boolean;
}

export type SetSupplierStatusError =
  | { kind: 'Forbidden' }
  | { kind: 'FeatureNotAvailable'; feature: string }
  | { kind: 'SupplierNotFound'; supplierId: string };

export interface SetSupplierStatusDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeSetSupplierStatus(deps: SetSupplierStatusDeps) {
  return async function setSupplierStatus(
    input: SetSupplierStatusInput,
  ): Promise<Result<{ archived: boolean }, SetSupplierStatusError>> {
    if (!deps.ctx.plan.has('purchasing')) {
      return err({ kind: 'FeatureNotAvailable', feature: 'purchasing' });
    }
    // `supplier:write`, el mismo que exige dar de alta un proveedor. Antes pedia
    // `purchase:write`: dos permisos distintos para escribir sobre el MISMO agregado,
    // asi que quien podia crear un proveedor podia no poder archivarlo. Ambos los tienen
    // hoy los mismos roles, de modo que no cambia quien puede hacer que; lo que cambia
    // es que la respuesta a "quien manda sobre los proveedores" deja de tener dos
    // versiones.
    if (!can(deps.ctx.actor, 'supplier:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const supplier = await repos.suppliers.findById(asId<SupplierId>(input.supplierId));
      if (!supplier) return err({ kind: 'SupplierNotFound', supplierId: input.supplierId });

      if (input.archived) supplier.archive(deps.clock.now());
      else supplier.restore();

      await repos.suppliers.save(supplier);
      await repos.audit.record({
        action: input.archived ? 'supplier.archived' : 'supplier.restored',
        entityType: 'supplier',
        entityId: supplier.id,
        summary: { code: supplier.code, name: supplier.name },
      });

      return ok({ archived: input.archived });
    });
  };
}
