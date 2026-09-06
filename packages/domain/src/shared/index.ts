export { ok, err, isOk, isErr, map, flatMap, mapErr, combine, unwrap, unwrapOr } from './result.js';
export type { Result, Ok, Err } from './result.js';

export { assertNever } from './errors.js';
export { AggregateRoot, asId } from './entity.js';
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
} from './entity.js';
export type {
  DomainErrorShape,
  ValidationError,
  MoneyError,
  ExchangeRateError,
  QuantityError,
} from './errors.js';

export * from './value-objects/index.js';
