import {
  ok,
  err,
  can,
  asId,
  type Result,
  type SupplierId,
  type SupplierError,
} from '@corebiz/domain';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { soloLoQueCambio } from '../../audit-diff';

/**
 * Caso de uso: corregir la ficha de un proveedor.
 *
 * Misma forma que `update-customer`, y detras del mismo gate de modulo que el resto de
 * compras. El gate vive AQUI y no en la ruta: una Server Action se puede invocar
 * directamente, asi que un modulo protegido solo por el enlace del menu no esta
 * protegido.
 *
 * El `code` no esta entre los campos: lo asigna el sistema al dar de alta.
 *
 * Un proveedor ARCHIVADO tambien se puede editar, y no es un descuido. Corregir el
 * telefono de alguien con quien se dejo de trabajar es exactamente lo que hace falta el
 * dia que se le vuelve a llamar; archivar oculta, no congela.
 */

export interface UpdateSupplierInput {
  readonly supplierId: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly contactName?: string | null;
  readonly notes?: string | null;
}

export type UpdateSupplierError =
  | { kind: 'Forbidden' }
  | { kind: 'FeatureNotAvailable'; feature: string }
  | { kind: 'SupplierNotFound'; supplierId: string }
  | SupplierError;

export interface UpdateSupplierDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
}

export function makeUpdateSupplier(deps: UpdateSupplierDeps) {
  return async function updateSupplier(
    input: UpdateSupplierInput,
  ): Promise<Result<{ id: string; code: string }, UpdateSupplierError>> {
    if (!deps.ctx.plan.has('purchasing')) {
      return err({ kind: 'FeatureNotAvailable', feature: 'purchasing' });
    }
    if (!can(deps.ctx.actor, 'supplier:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const supplier = await repos.suppliers.findById(asId<SupplierId>(input.supplierId));
      if (!supplier) return err({ kind: 'SupplierNotFound', supplierId: input.supplierId });

      const antes = {
        name: supplier.name,
        taxId: supplier.taxId,
        email: supplier.email,
        phone: supplier.phone,
        contactName: supplier.contactName,
        notes: supplier.notes,
      };

      const renamed = supplier.rename(input.name);
      if (!renamed.ok) return renamed;

      // Todas las claves van siempre, incluso vacias: este formulario envia la ficha
      // entera, asi que dejar un campo en blanco significa vaciarlo.
      const contacted = supplier.updateContact({
        taxId: input.taxId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        contactName: input.contactName ?? null,
        notes: input.notes ?? null,
      });
      if (!contacted.ok) return contacted;

      await repos.suppliers.save(supplier);

      const despues = {
        name: supplier.name,
        taxId: supplier.taxId,
        email: supplier.email,
        phone: supplier.phone,
        contactName: supplier.contactName,
        notes: supplier.notes,
      };

      await repos.audit.record({
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: supplier.id,
        summary: { code: supplier.code, name: supplier.name },
        diff: soloLoQueCambio(antes, despues),
      });

      return ok({ id: supplier.id, code: supplier.code });
    });
  };
}
