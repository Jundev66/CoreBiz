import { Money } from '@corebiz/domain';
import type { CustomerId } from '@corebiz/domain';
import type { PaymentQueries } from '@corebiz/application';

/**
 * Saldo pendiente de un cliente.
 *
 * Devuelve cero porque el modulo de cobros todavia no existe: la tabla `payments`
 * esta prevista en las politicas RLS pero aun no se ha creado (ver docs/ROADMAP.md).
 *
 * La consecuencia practica hay que tenerla presente: el limite de credito que
 * comprueba el caso de uso de emision nunca se dispara, porque el saldo siempre
 * es cero. No es un fallo del limite —la regla esta implementada y probada en el
 * dominio—, es que todavia no hay deudas que contar. Cuando exista el modulo,
 * esta clase pasa a sumar los cobros pendientes y la regla empieza a morder sin
 * tocar ni el dominio ni el caso de uso.
 */
export class PrismaPaymentQueries implements PaymentQueries {
  outstandingBalanceFor(_customerId: CustomerId, currency: 'USD' | 'VES'): Promise<Money> {
    return Promise.resolve(Money.zero(currency));
  }
}
