/**
 * @corebiz/infrastructure — los adaptadores concretos.
 *
 * Aqui vive todo lo que sabe de Postgres, de Drizzle y de Supabase. El dominio y
 * los casos de uso no conocen este paquete: la dependencia apunta hacia adentro,
 * y `pnpm arch` rompe el build si alguien la invierte.
 */
export { DrizzleUnitOfWork, type UnitOfWorkDeps } from './drizzle/unit-of-work';
export type { Tx } from './drizzle/tx';
export { DrizzleCustomerRepository } from './drizzle/customers';
export { DrizzleProductRepository } from './drizzle/products';
export { DrizzleDeliveryNoteRepository } from './drizzle/delivery-notes';
export { DrizzleDocumentSequences } from './drizzle/sequences';
export { DrizzleUsageCounter } from './drizzle/usage';
export { DrizzleAuditLogger } from './drizzle/audit';
export { DrizzlePaymentQueries } from './drizzle/payments';
