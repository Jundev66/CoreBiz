declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type CustomerId = Branded<string, 'CustomerId'>;
export type ProductId = Branded<string, 'ProductId'>;
export type SupplierId = Branded<string, 'SupplierId'>;
export type DeliveryNoteId = Branded<string, 'DeliveryNoteId'>;
export type PaymentId = Branded<string, 'PaymentId'>;
export type TenantId = Branded<string, 'TenantId'>;
export type UserId = Branded<string, 'UserId'>;

export const asId = <T extends Branded<string, string>>(value: string): T => value as T;

export interface DomainEvent<TPayload = Readonly<Record<string, unknown>>> {
  readonly id?: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly tenantId: string;
  readonly payload: TPayload;
}

export abstract class AggregateRoot<TId extends string> {
  private domainEvents: DomainEvent[] = [];

  protected constructor(readonly id: TId) {}

  protected recordEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): readonly DomainEvent[] {
    const events = [...this.domainEvents];
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
