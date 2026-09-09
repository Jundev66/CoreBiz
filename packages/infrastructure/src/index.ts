/**
 * @corebiz/infrastructure — los adaptadores concretos.
 *
 * Aqui vive todo lo que sabe de Postgres, de Drizzle y de Supabase. El dominio y
 * los casos de uso no conocen este paquete: la dependencia apunta hacia adentro,
 * y `pnpm arch` rompe el build si alguien la invierte.
 */
export { PrismaUnitOfWork, type UnitOfWorkDeps } from './prisma/unit-of-work';
export type { Tx } from './prisma/session';
export { PrismaCustomerRepository } from './prisma/customers';
export { PrismaProductRepository } from './prisma/products';
export { PrismaDeliveryNoteRepository } from './prisma/delivery-notes';
export { PrismaDocumentSequences } from './prisma/sequences';
export { PrismaUsageCounter } from './prisma/usage';
export { PrismaAuditLogger } from './prisma/audit';
export { PrismaPaymentQueries } from './prisma/payments';
export { prismaReadModels } from './queries/read-models';
export {
  postgresRuntime,
  loadTenantProfile,
  type PostgresRuntime,
  type PostgresRuntimeDeps,
  type TenantProfile,
} from './runtime';
export { establishTenantContext, readOnly, asUser } from './prisma/session';
export { PrismaRateLimiter, postgresRateLimiter } from './prisma/rate-limiter';
export {
  listMemberships,
  provisionTenant,
  type Membership,
  type ProvisionError,
  type ProvisionResult,
} from './prisma/identity';
export {
  PrismaInvitationRepository,
  PrismaMembershipRepository,
  PrismaTenantSettingsRepository,
} from './prisma/administration';
export { prismaAdminQueries } from './queries/administration';
export { cryptoTokenFactory, hashInvitationToken } from './crypto/tokens';
export {
  previewInvitation,
  acceptInvitation,
  type InvitationPreview,
  type AcceptInvitationResult,
} from './prisma/invitations-flow';
export { PrismaSupplierRepository, PrismaGoodsReceiptRepository } from './prisma/purchasing';
export { prismaPurchasingQueries } from './queries/purchasing';
export { databaseIsReachable } from './prisma/health';
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
} from './prisma/demo';
