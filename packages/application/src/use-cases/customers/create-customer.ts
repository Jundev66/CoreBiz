import {
  ok,
  err,
  can,
  asId,
  Money,
  Customer,
  type Result,
  type CustomerId,
  type CustomerError,
  type QuotaError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { TenantContext, UnitOfWork } from '../../ports/repositories.js';

/**
 * Caso de uso: dar de alta un cliente.
 *
 * Es el patron que siguen todos los demas, y el orden de las comprobaciones importa:
 *
 *   1. Autorizacion   — antes de tocar nada.
 *   2. Cuota          — antes de validar, para que un plan agotado responda rapido.
 *   3. Unicidad       — dentro de la transaccion, donde el resultado es fiable.
 *   4. Invariantes    — las decide el dominio, no este archivo.
 *   5. Persistencia   — junto con contador y auditoria, de forma atomica.
 */

export interface CreateCustomerInput {
  readonly code: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly creditLimit?: string | null;
}

export type CreateCustomerError =
  | { kind: 'Forbidden' }
  | { kind: 'DuplicateCode'; code: string }
  | { kind: 'InvalidCreditLimit'; raw: string }
  | QuotaError
  | CustomerError;

export interface CreateCustomerOutput {
  readonly id: string;
  readonly code: string;
}

export interface CreateCustomerDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeCreateCustomer(deps: CreateCustomerDeps) {
  return async function createCustomer(
    input: CreateCustomerInput,
  ): Promise<Result<CreateCustomerOutput, CreateCustomerError>> {
    // 1. Autorizacion. Se comprueba AQUI y no en el componente: ocultar un boton no es
    //    una medida de seguridad, porque la Server Action se puede invocar directamente.
    if (!can(deps.ctx.actor, 'customer:write')) {
      return err({ kind: 'Forbidden' });
    }

    return deps.uow.run(async (repos) => {
      // 2. Cuota, con el contador O(1) en lugar de un COUNT(*).
      const used = await repos.usage.current('customers');
      const quota = deps.ctx.plan.checkQuota('customers', used);
      if (!quota.ok) return quota;

      // 3. Unicidad dentro de la transaccion. Comprobarla fuera daria una respuesta que
      //    puede quedar obsoleta antes de escribir; la base de datos tiene ademas un
      //    indice unico como red de seguridad ante escrituras concurrentes.
      const normalizedCode = input.code.trim().toUpperCase();
      const existing = await repos.customers.findByCode(normalizedCode);
      if (existing) {
        return err({ kind: 'DuplicateCode', code: normalizedCode });
      }

      let creditLimit: Money | null = null;
      if (input.creditLimit != null && input.creditLimit.trim() !== '') {
        const parsed = Money.of(input.creditLimit, deps.ctx.settings.baseCurrency);
        if (!parsed.ok) {
          return err({ kind: 'InvalidCreditLimit', raw: input.creditLimit });
        }
        creditLimit = parsed.value;
      }

      // 4. El dominio decide si los datos forman un cliente valido.
      const created = Customer.create({
        id: asId<CustomerId>(deps.ids.next()),
        tenantId: deps.ctx.tenantId,
        code: input.code,
        name: input.name,
        taxId: input.taxId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        creditLimit,
        createdAt: deps.clock.now(),
      });
      if (!created.ok) return created;

      const customer = created.value;

      // 5. Escritura atomica: entidad, contador y auditoria en la misma transaccion.
      //    Si la auditoria fallase, la creacion se deshace: un cambio sin rastro es
      //    peor que un cambio que no ocurre.
      await repos.customers.save(customer);
      await repos.usage.increment('customers');
      await repos.audit.record({
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        summary: { code: customer.code, name: customer.name },
      });

      return ok({ id: customer.id, code: customer.code });
    });
  };
}
