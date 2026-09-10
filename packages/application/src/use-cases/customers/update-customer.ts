import {
  ok,
  err,
  can,
  asId,
  Money,
  type Result,
  type CustomerId,
  type CustomerError,
  type CustomerAddress,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { soloLoQueCambio } from '../../audit-diff';

/**
 * Caso de uso: corregir la ficha de un cliente.
 *
 * Hasta ahora el sistema sabia dar de alta y archivar, y no corregir. Un telefono mal
 * escrito obligaba a archivar al cliente y crear otro — que ademas nace con un codigo
 * nuevo y deja las notas de entrega viejas apuntando a la ficha muerta.
 *
 * QUE NO SE PUEDE EDITAR, Y POR QUE
 *
 * El `code` no esta entre los campos. Lo asigna el sistema al dar de alta, con el mismo
 * correlativo que numera las notas de entrega, y cambiarlo romperia la unica referencia
 * estable que tiene un cliente en los documentos ya impresos.
 *
 * EL LIMITE DE CREDITO ES EL UNICO CAMPO CON UNA REGLA DE NEGOCIO DETRAS
 *
 * No puede quedar por debajo del saldo pendiente: dejaria al cliente en mora retroactiva
 * sin que haya comprado nada nuevo. El saldo vive en otro agregado, asi que lo aporta
 * este caso de uso y lo decide el dominio.
 *
 * Hoy `outstandingBalanceFor` devuelve siempre cero porque no hay modulo de cobros, asi
 * que la regla existe y no llega a dispararse. Se consulta igual: el dia que haya cobros
 * que restar, esto ya esta puesto y no hay que acordarse.
 */

export interface UpdateCustomerInput {
  readonly customerId: string;
  readonly name: string;
  readonly taxId?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly creditLimit?: string | null;
  /** Igual que al crear: llega plana desde el formulario y se estructura aqui. */
  readonly addressLine1?: string | null;
  readonly addressCity?: string | null;
  readonly addressState?: string | null;
}

export type UpdateCustomerError =
  | { kind: 'Forbidden' }
  | { kind: 'CustomerNotFound'; customerId: string }
  | { kind: 'InvalidCreditLimit'; raw: string }
  | CustomerError;

export interface UpdateCustomerDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeUpdateCustomer(deps: UpdateCustomerDeps) {
  return async function updateCustomer(
    input: UpdateCustomerInput,
  ): Promise<Result<{ id: string; code: string }, UpdateCustomerError>> {
    if (!can(deps.ctx.actor, 'customer:write')) return err({ kind: 'Forbidden' });

    return deps.uow.run(async (repos) => {
      const customer = await repos.customers.findById(asId<CustomerId>(input.customerId));
      // "No existe" y no "no puedes": pedir la ficha de otro comercio no puede
      // distinguirse de pedir una que no hay. Ver `security.spec.ts`.
      if (!customer) return err({ kind: 'CustomerNotFound', customerId: input.customerId });

      // Lo de antes, para el registro de auditoria. Se toma ANTES de tocar nada: el
      // agregado es mutable y despues ya no habria con que comparar.
      const antes = {
        name: customer.name,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        creditLimit: customer.creditLimit?.toString() ?? null,
      };

      const renamed = customer.rename(input.name);
      if (!renamed.ok) return renamed;

      const taxed = customer.setTaxId(input.taxId ?? null);
      if (!taxed.ok) return taxed;

      // Misma regla que al crear: una direccion sin ninguna parte rellena es AUSENCIA
      // de direccion, no una direccion vacia.
      const partes = {
        ...(input.addressLine1?.trim() ? { line1: input.addressLine1.trim() } : {}),
        ...(input.addressCity?.trim() ? { city: input.addressCity.trim() } : {}),
        ...(input.addressState?.trim() ? { state: input.addressState.trim() } : {}),
      };
      const address: CustomerAddress | null = Object.keys(partes).length > 0 ? partes : null;

      // Las tres claves van SIEMPRE, incluso vacias: este formulario envia la ficha
      // entera, asi que vaciar un campo aqui significa vaciarlo de verdad. El agregado
      // distingue omitir de vaciar, y lo que se quiere en esta pantalla es lo segundo.
      const contacted = customer.updateContact({
        email: input.email ?? null,
        phone: input.phone ?? null,
        address,
      });
      if (!contacted.ok) return contacted;

      if (input.creditLimit != null && input.creditLimit.trim() !== '') {
        const parsed = Money.of(input.creditLimit, deps.ctx.settings.baseCurrency);
        if (!parsed.ok) return err({ kind: 'InvalidCreditLimit', raw: input.creditLimit });

        const balance = await repos.payments.outstandingBalanceFor(
          customer.id,
          deps.ctx.settings.baseCurrency,
        );
        // `CreditLimitBelowBalance` sale del dominio y viaja tal cual: es una regla de
        // negocio, asi que el borde HTTP la traduce a 422 y no a 400.
        const limited = customer.setCreditLimit(parsed.value, balance);
        if (!limited.ok) return limited;
      } else {
        const cleared = customer.setCreditLimit(null, Money.zero(deps.ctx.settings.baseCurrency));
        if (!cleared.ok) return cleared;
      }

      await repos.customers.save(customer);

      const despues = {
        name: customer.name,
        taxId: customer.taxId,
        email: customer.email,
        phone: customer.phone,
        creditLimit: customer.creditLimit?.toString() ?? null,
      };

      await repos.audit.record({
        action: 'customer.updated',
        entityType: 'customer',
        entityId: customer.id,
        summary: { code: customer.code, name: customer.name },
        // Solo lo que cambio. Un registro que repite la ficha entera en cada guardado
        // obliga a comparar a ojo dos bloques casi identicos para encontrar el campo
        // que se toco, que es justo lo que se va a buscar dentro de seis meses.
        diff: soloLoQueCambio(antes, despues),
      });

      return ok({ id: customer.id, code: customer.code });
    });
  };
}
