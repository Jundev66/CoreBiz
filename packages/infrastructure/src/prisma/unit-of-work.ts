import type {
  Clock,
  IdGenerator,
  Repositories,
  TenantContext,
  UnitOfWork,
} from '@corebiz/application';
import type { PrismaClient } from '@corebiz/prisma-client';
import { PrismaCustomerRepository } from './customers';
import { PrismaProductRepository } from './products';
import { PrismaDeliveryNoteRepository } from './delivery-notes';
import { PrismaDocumentSequences } from './sequences';
import { PrismaUsageCounter } from './usage';
import { PrismaAuditLogger } from './audit';
import { PrismaPaymentQueries } from './payments';
import {
  PrismaInvitationRepository,
  PrismaMembershipRepository,
  PrismaTenantSettingsRepository,
} from './administration';
import { PrismaGoodsReceiptRepository, PrismaSupplierRepository } from './purchasing';
import { withTenant } from './session';

export interface UnitOfWorkDeps {
  readonly prisma: PrismaClient;
  readonly ctx: TenantContext;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Unit of Work sobre una transaccion real de Postgres.
 *
 * Emitir una nota de entrega toca cinco tablas. O ocurre todo, o no ocurre nada: un fallo
 * a mitad deja el inventario descuadrado, y un inventario descuadrado es un ERP en el que
 * ya nadie confia.
 *
 * SEMANTICA DE REVERSION, a preservar conscientemente: la transaccion se revierte ante una
 * EXCEPCION, no ante un `Result` en error. Los casos de uso devuelven `err(...)` como
 * valor normal y eso CONFIRMA la transaccion. Funciona porque todos validan antes de la
 * primera escritura, y es el mismo comportamiento que tiene el doble en memoria. Si algun
 * dia un caso de uso escribiera antes de poder devolver `err`, habria que lanzar en vez de
 * devolver.
 *
 * Con Prisma aparece un tercer camino que antes no existia: la transaccion tiene un tiempo
 * maximo, y agotarlo revierte. Los limites estan puestos explicitamente en `session.ts`
 * por eso mismo — los de fabrica son cinco segundos, y emitir una nota contra una base en
 * otra region puede pasar de ahi.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly deps: UnitOfWorkDeps) {}

  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    const { prisma, ctx, ids, clock } = this.deps;

    return withTenant(prisma, ctx, (tx) =>
      fn({
        customers: new PrismaCustomerRepository(tx, ctx.tenantId),
        products: new PrismaProductRepository(tx, ctx.tenantId, ids),
        deliveryNotes: new PrismaDeliveryNoteRepository(tx, ctx.tenantId),
        sequences: new PrismaDocumentSequences(tx, ctx.tenantId),
        payments: new PrismaPaymentQueries(),
        usage: new PrismaUsageCounter(tx, ctx.tenantId, clock),
        audit: new PrismaAuditLogger(tx, ctx, ids, clock),
        invitations: new PrismaInvitationRepository(tx, ctx.tenantId),
        members: new PrismaMembershipRepository(tx, ctx.tenantId),
        settings: new PrismaTenantSettingsRepository(tx, ctx.tenantId),
        suppliers: new PrismaSupplierRepository(tx, ctx.tenantId),
        goodsReceipts: new PrismaGoodsReceiptRepository(tx, ctx.tenantId),
      }),
    );
  }
}
