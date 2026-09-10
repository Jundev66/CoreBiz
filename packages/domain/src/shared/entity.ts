/**
 * Primitivas de modelado: identidad, agregados y eventos de dominio.
 */

/**
 * Identificador con marca de tipo (branded type).
 *
 * `CustomerId` y `ProductId` son ambos strings en tiempo de ejecucion, pero TypeScript
 * los trata como incompatibles. Pasar un id de producto donde se espera uno de cliente
 * deja de ser un bug de produccion silencioso y pasa a ser un error de compilacion.
 */
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type CustomerId = Branded<string, 'CustomerId'>;
export type ProductId = Branded<string, 'ProductId'>;
export type SupplierId = Branded<string, 'SupplierId'>;
export type DeliveryNoteId = Branded<string, 'DeliveryNoteId'>;
export type TenantId = Branded<string, 'TenantId'>;
export type UserId = Branded<string, 'UserId'>;

/**
 * Convierte un string en un id tipado.
 *
 * No valida el formato a proposito: la validacion de entrada es trabajo de Zod en el
 * borde de la aplicacion. Aqui el objetivo es la seguridad de tipos, no la validacion.
 */
export const asId = <T extends Branded<string, string>>(value: string): T => value as T;

/**
 * Evento de dominio: algo relevante que YA ocurrio.
 *
 * Se publican DESPUES del commit, nunca dentro de la transaccion. Un manejador que
 * falla no debe deshacer una venta que ya es un hecho del negocio.
 */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
  readonly tenantId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Raiz de agregado: la frontera de consistencia.
 *
 * Todo lo que hay dentro de un agregado se guarda en la misma transaccion y cumple sus
 * invariantes en todo momento. Entre agregados solo se referencian identificadores,
 * nunca objetos: si `DeliveryNote` guardase el objeto `Customer` completo, cargar una
 * nota arrastraria media base de datos y las dos entidades quedarian acopladas.
 */
export abstract class AggregateRoot<TId extends string> {
  private domainEvents: DomainEvent[] = [];

  protected constructor(readonly id: TId) {}

  protected recordEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  /**
   * Devuelve los eventos acumulados y VACIA la lista.
   *
   * Vaciar es intencionado: evita que el mismo evento se publique dos veces si el
   * agregado se guarda mas de una vez dentro de la misma unidad de trabajo.
   */
  pullDomainEvents(): readonly DomainEvent[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }

  get hasPendingEvents(): boolean {
    return this.domainEvents.length > 0;
  }

  equals(other: AggregateRoot<TId>): boolean {
    return this.id === other.id;
  }
}
