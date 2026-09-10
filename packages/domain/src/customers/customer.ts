import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type CustomerId, type TenantId } from '../shared/entity';
import { Money, type Currency } from '../shared/value-objects/money';

/**
 * Cliente del comercio.
 *
 * Es deliberadamente un agregado sencillo: casi un CRUD. No todo agregado merece la
 * misma ceremonia — ver docs/adr/001. Aqui las unicas reglas reales son el formato de
 * los datos y el limite de credito; el musculo del dominio esta en ventas e inventario.
 */

export interface CustomerAddress {
  readonly line1?: string;
  readonly city?: string;
  readonly state?: string;
  readonly notes?: string;
}

export type CustomerError =
  ValidationError | { kind: 'CreditLimitBelowBalance'; balance: string; requested: string };

/**
 * Estado interno del agregado.
 *
 * Se exporta porque es el argumento de `rehydrate()`, y quien reconstruye el
 * agregado desde la base de datos vive fuera del dominio. No es una invitacion a
 * construirlo a mano: crear un Customer valido sigue pasando por `create()`.
 */
export interface CustomerProps {
  readonly tenantId: TenantId;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: CustomerAddress | null;
  readonly creditLimit: Money | null;
  readonly archivedAt: Date | null;
}

const NAME_MIN = 2;
const NAME_MAX = 120;
const CODE_MAX = 24;

/**
 * Mismo limite que declara el contrato Zod, repetido a proposito.
 *
 * El dominio no puede dar por hecho que alguien valido antes: un caso de uso invocado
 * desde otro sitio —una importacion, una semilla, otro modulo— no pasa por el borde HTTP.
 */
const TAX_ID_MAX = 24;

/**
 * Validacion de email deliberadamente permisiva.
 *
 * Las expresiones regulares "estrictas" de email rechazan direcciones perfectamente
 * validas y son una fuente conocida de frustracion. Se comprueba la forma minima; la
 * unica prueba real de que un email funciona es enviarle algo.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Customer extends AggregateRoot<CustomerId> {
  private constructor(
    id: CustomerId,
    private props: CustomerProps,
  ) {
    super(id);
  }

  static create(input: {
    id: CustomerId;
    tenantId: TenantId;
    code: string;
    name: string;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: CustomerAddress | null;
    creditLimit?: Money | null;
    createdAt: Date;
  }): Result<Customer, CustomerError> {
    const name = input.name.trim();
    if (name.length === 0) return err({ kind: 'Required', field: 'name' });
    if (name.length < NAME_MIN) return err({ kind: 'TooShort', field: 'name', min: NAME_MIN });
    if (name.length > NAME_MAX) return err({ kind: 'TooLong', field: 'name', max: NAME_MAX });

    const code = input.code.trim().toUpperCase();
    if (code.length === 0) return err({ kind: 'Required', field: 'code' });
    if (code.length > CODE_MAX) return err({ kind: 'TooLong', field: 'code', max: CODE_MAX });

    const taxId = input.taxId?.trim() || null;
    if (taxId !== null && taxId.length > TAX_ID_MAX) {
      return err({ kind: 'TooLong', field: 'taxId', max: TAX_ID_MAX });
    }

    const email = input.email?.trim().toLowerCase() || null;
    if (email !== null && !EMAIL_SHAPE.test(email)) {
      return err({ kind: 'InvalidFormat', field: 'email', expected: 'usuario@dominio.com' });
    }

    if (input.creditLimit && input.creditLimit.isNegative) {
      return err({ kind: 'OutOfRange', field: 'creditLimit', min: 0 });
    }

    const customer = new Customer(input.id, {
      tenantId: input.tenantId,
      code,
      name,
      taxId,
      email,
      phone: input.phone?.trim() || null,
      address: input.address ?? null,
      creditLimit: input.creditLimit ?? null,
      archivedAt: null,
    });

    customer.recordEvent({
      type: 'customer.created',
      occurredAt: input.createdAt,
      tenantId: input.tenantId,
      payload: { customerId: input.id, code, name },
    });

    return ok(customer);
  }

  /** Reconstruye desde la base de datos sin revalidar ni emitir eventos. */
  static rehydrate(id: CustomerId, props: CustomerProps): Customer {
    return new Customer(id, props);
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get taxId(): string | null {
    return this.props.taxId;
  }
  get email(): string | null {
    return this.props.email;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get address(): CustomerAddress | null {
    return this.props.address;
  }
  get creditLimit(): Money | null {
    return this.props.creditLimit;
  }
  get isArchived(): boolean {
    return this.props.archivedAt !== null;
  }

  rename(name: string): Result<void, CustomerError> {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN) return err({ kind: 'TooShort', field: 'name', min: NAME_MIN });
    if (trimmed.length > NAME_MAX) return err({ kind: 'TooLong', field: 'name', max: NAME_MAX });
    this.props = { ...this.props, name: trimmed };
    return ok(undefined);
  }

  /**
   * Cambia los datos de contacto.
   *
   * REGLA: el campo que viene se aplica; el que no viene se queda como estaba. Pasar
   * `null` BORRA, y omitir no toca nada. La distincion la hace `in`, y no `??`, porque
   * `??` no puede separar "no me lo has dado" de "quiero vaciarlo".
   *
   * Esto no era asi y las tres claves se comportaban de dos maneras distintas: `email`
   * y `phone` se borraban al omitirlos —lo que convierte cualquier actualizacion parcial
   * en una perdida de datos silenciosa— y `address` hacia `input.address ?? this.props.address`,
   * asi que una direccion NO SE PODIA VACIAR NUNCA: quien se mudaba y dejaba el campo en
   * blanco seguia teniendo impresa la direccion vieja en la siguiente nota de entrega.
   */
  updateContact(input: {
    email?: string | null;
    phone?: string | null;
    address?: CustomerAddress | null;
  }): Result<void, CustomerError> {
    const email = 'email' in input ? input.email?.trim().toLowerCase() || null : this.props.email;
    if (email !== null && !EMAIL_SHAPE.test(email)) {
      return err({ kind: 'InvalidFormat', field: 'email', expected: 'usuario@dominio.com' });
    }
    this.props = {
      ...this.props,
      email,
      phone: 'phone' in input ? input.phone?.trim() || null : this.props.phone,
      address: 'address' in input ? input.address : this.props.address,
    };
    return ok(undefined);
  }

  /**
   * Cambia el identificador fiscal, o lo quita.
   *
   * El limite de 24 es el mismo que declara el contrato Zod, y esta repetido a proposito:
   * el dominio no puede depender de que alguien haya validado antes. Sin el, la unica
   * defensa vive en el borde HTTP y un caso de uso invocado desde otro sitio la salta.
   */
  setTaxId(taxId: string | null): Result<void, CustomerError> {
    const trimmed = taxId?.trim() || null;
    if (trimmed !== null && trimmed.length > TAX_ID_MAX) {
      return err({ kind: 'TooLong', field: 'taxId', max: TAX_ID_MAX });
    }
    this.props = { ...this.props, taxId: trimmed };
    return ok(undefined);
  }

  /**
   * Fija el limite de credito.
   *
   * No puede quedar por debajo del saldo ya pendiente: dejaria al cliente en mora
   * retroactiva sin que haya comprado nada nuevo, que es un efecto que nadie espera.
   * El saldo lo aporta el caso de uso, porque vive en otro agregado.
   */
  setCreditLimit(limit: Money | null, currentBalance: Money): Result<void, CustomerError> {
    if (limit === null) {
      this.props = { ...this.props, creditLimit: null };
      return ok(undefined);
    }
    if (limit.isNegative) {
      return err({ kind: 'OutOfRange', field: 'creditLimit', min: 0 });
    }

    const comparison = limit.compare(currentBalance);
    if (comparison.ok && comparison.value < 0) {
      return err({
        kind: 'CreditLimitBelowBalance',
        balance: currentBalance.toString(),
        requested: limit.toString(),
      });
    }

    this.props = { ...this.props, creditLimit: limit };
    return ok(undefined);
  }

  /** Comprueba si una venta cabe dentro del credito disponible. */
  canAfford(currentBalance: Money, newCharge: Money): boolean {
    if (this.props.creditLimit === null) return true;
    const projected = currentBalance.add(newCharge);
    if (!projected.ok) return false;
    const comparison = projected.value.compare(this.props.creditLimit);
    return comparison.ok && comparison.value <= 0;
  }

  /**
   * Archivar en lugar de borrar.
   *
   * Un cliente con notas de entrega emitidas no se puede eliminar sin dejar documentos
   * huerfanos. Archivar lo saca de los desplegables sin romper el historico.
   */
  archive(at: Date): Result<void, CustomerError> {
    if (this.isArchived) return ok(undefined);
    this.props = { ...this.props, archivedAt: at };
    this.recordEvent({
      type: 'customer.archived',
      occurredAt: at,
      tenantId: this.props.tenantId,
      payload: { customerId: this.id, code: this.props.code },
    });
    return ok(undefined);
  }

  restore(): void {
    this.props = { ...this.props, archivedAt: null };
  }

  /** Vista plana para la capa de persistencia. */
  snapshot(): CustomerProps & { id: CustomerId } {
    return { id: this.id, ...this.props };
  }

  static zeroBalance(currency: Currency): Money {
    return Money.zero(currency);
  }
}
