import { ok, err, type Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { AggregateRoot, type SupplierId, type TenantId } from '../shared/entity';

/**
 * Proveedor.
 *
 * Es casi un CRUD y esta bien que lo sea. Aplicar la misma ceremonia a todos los
 * agregados —eventos, maquina de estados, invariantes elaboradas— seria peor
 * ingenieria, no mejor: aqui las unicas reglas reales son de formato, y fingir lo
 * contrario solo anadiria codigo que hay que mantener sin nada que proteger.
 *
 * El musculo del modulo de compras esta en `GoodsReceipt`, donde SI hay una
 * invariante que no puede violarse: la mercancia recibida entra al inventario
 * generando movimientos, y una recepcion no se puede aplicar dos veces.
 */

export type SupplierError = ValidationError;

export interface SupplierProps {
  readonly tenantId: TenantId;
  readonly code: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  /** Persona de contacto. En un comercio pequeno se trata con alguien, no con una empresa. */
  readonly contactName: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
}

const NAME_MIN = 2;
const NAME_MAX = 120;
const CODE_MAX = 24;

/** La misma forma permisiva que en `Customer`: la unica prueba real es enviar algo. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Supplier extends AggregateRoot<SupplierId> {
  private constructor(
    id: SupplierId,
    private props: SupplierProps,
  ) {
    super(id);
  }

  static create(input: {
    id: SupplierId;
    tenantId: TenantId;
    code: string;
    name: string;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    contactName?: string | null;
    notes?: string | null;
    createdAt: Date;
  }): Result<Supplier, SupplierError> {
    const name = input.name.trim();
    if (name.length === 0) return err({ kind: 'Required', field: 'name' });
    if (name.length < NAME_MIN) return err({ kind: 'TooShort', field: 'name', min: NAME_MIN });
    if (name.length > NAME_MAX) return err({ kind: 'TooLong', field: 'name', max: NAME_MAX });

    const code = input.code.trim().toUpperCase();
    if (code.length === 0) return err({ kind: 'Required', field: 'code' });
    if (code.length > CODE_MAX) return err({ kind: 'TooLong', field: 'code', max: CODE_MAX });

    const email = input.email?.trim().toLowerCase() || null;
    if (email !== null && !EMAIL_SHAPE.test(email)) {
      return err({ kind: 'InvalidFormat', field: 'email', expected: 'usuario@dominio.com' });
    }

    const supplier = new Supplier(input.id, {
      tenantId: input.tenantId,
      code,
      name,
      taxId: input.taxId?.trim() || null,
      email,
      phone: input.phone?.trim() || null,
      contactName: input.contactName?.trim() || null,
      notes: input.notes?.trim() || null,
      archivedAt: null,
    });

    supplier.recordEvent({
      type: 'supplier.created',
      occurredAt: input.createdAt,
      tenantId: input.tenantId,
      payload: { supplierId: input.id, code, name },
    });

    return ok(supplier);
  }

  /** Reconstruye desde la base de datos sin revalidar ni emitir eventos. */
  static rehydrate(id: SupplierId, props: SupplierProps): Supplier {
    return new Supplier(id, props);
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
  get contactName(): string | null {
    return this.props.contactName;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get isArchived(): boolean {
    return this.props.archivedAt !== null;
  }
  get snapshot(): SupplierProps {
    return this.props;
  }

  /**
   * Se archiva, no se borra.
   *
   * Un proveedor con recepciones registradas no se puede borrar sin dejar el
   * historico de compras apuntando al vacio. Archivar lo saca de los desplegables
   * y conserva la explicacion de donde vino cada entrada de mercancia.
   */
  archive(at: Date): void {
    if (this.props.archivedAt !== null) return;
    this.props = { ...this.props, archivedAt: at };
  }
}
