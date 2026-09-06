export { ok, err, isOk, isErr, map, flatMap, mapErr, combine, unwrap, unwrapOr } from './result';
export type { Result, Ok, Err } from './result';

export { assertNever } from './errors';
export { AggregateRoot, asId } from './entity';
export type {
  Branded,
  DomainEvent,
  CustomerId,
  ProductId,
  SupplierId,
  QuoteId,
  DeliveryNoteId,
  PaymentId,
  PurchaseOrderId,
  TenantId,
  UserId,
} from './entity';
export type {
  DomainErrorShape,
  ValidationError,
  MoneyError,
  ExchangeRateError,
  QuantityError,
} from './errors';

export * from './value-objects/index';
