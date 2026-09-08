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
export { drizzleReadModels } from './queries/read-models';
export {
  postgresRuntime,
  loadTenantProfile,
  type PostgresRuntime,
  type PostgresRuntimeDeps,
  type TenantProfile,
} from './runtime';
export { establishTenantContext, readOnly, asUser } from './drizzle/session';
export { DrizzleRateLimiter, postgresRateLimiter } from './drizzle/rate-limiter';
export {
  listMemberships,
  provisionTenant,
  type Membership,
  type ProvisionError,
  type ProvisionResult,
} from './drizzle/identity';
export {
  DrizzleInvitationRepository,
  DrizzleMembershipRepository,
  DrizzleTenantSettingsRepository,
} from './drizzle/administration';
export { drizzleAdminQueries } from './queries/administration';
export { cryptoTokenFactory, hashInvitationToken } from './crypto/tokens';
export {
  previewInvitation,
  acceptInvitation,
  type InvitationPreview,
  type AcceptInvitationResult,
} from './drizzle/invitations-flow';
export { DrizzleSupplierRepository, DrizzleGoodsReceiptRepository } from './drizzle/purchasing';
export { drizzlePurchasingQueries } from './queries/purchasing';
export { databaseIsReachable } from './drizzle/health';
export {
  demoCapacity,
  provisionDemoSandbox,
  demoSandboxIsAlive,
  purgeExpiredDemos,
  type DemoMode,
  type DemoCapacity,
  type ProvisionDemoResult,
  type ProvisionDemoOptions,
  type DemoCredentials,
} from './drizzle/demo';
