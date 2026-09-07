import type { Database } from '@corebiz/db';
import type {
  Clock,
  IdGenerator,
  Repositories,
  TenantContext,
  UnitOfWork,
} from '@corebiz/application';
import { DrizzleCustomerRepository } from './customers';
import { DrizzleProductRepository } from './products';
import { DrizzleDeliveryNoteRepository } from './delivery-notes';
import { DrizzleDocumentSequences } from './sequences';
import { DrizzleUsageCounter } from './usage';
import { DrizzleAuditLogger } from './audit';
import { DrizzlePaymentQueries } from './payments';
import {
  DrizzleInvitationRepository,
  DrizzleMembershipRepository,
  DrizzleTenantSettingsRepository,
} from './administration';
import { DrizzleGoodsReceiptRepository, DrizzleSupplierRepository } from './purchasing';
import { establishTenantContext } from './session';

export interface UnitOfWorkDeps {
  readonly db: Database;
  readonly ctx: TenantContext;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Unit of Work sobre una transaccion real de Postgres.
 *
 * Emitir una nota de entrega toca cinco tablas. O ocurre todo, o no ocurre nada:
 * un fallo a mitad deja el inventario descuadrado, y un inventario descuadrado es
 * un ERP en el que ya nadie confia.
 *
 * SEMANTICA DE REVERSION, a preservar conscientemente: la transaccion se revierte
 * ante una EXCEPCION, no ante un `Result` en error. Los casos de uso devuelven
 * `err(...)` como valor normal y eso CONFIRMA la transaccion. Funciona porque
 * todos validan antes de la primera escritura, y es el mismo comportamiento que
 * tiene el doble en memoria. Si algun dia un caso de uso escribiera antes de
 * poder devolver `err`, habria que lanzar en vez de devolver.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly deps: UnitOfWorkDeps) {}

  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    const { db, ctx, ids, clock } = this.deps;

    return db.transaction(async (tx) => {
      await establishTenantContext(tx, ctx);

      return fn({
        customers: new DrizzleCustomerRepository(tx, ctx.tenantId),
        products: new DrizzleProductRepository(tx, ctx.tenantId, ids),
        deliveryNotes: new DrizzleDeliveryNoteRepository(tx, ctx.tenantId),
        sequences: new DrizzleDocumentSequences(tx, ctx.tenantId),
        payments: new DrizzlePaymentQueries(),
        usage: new DrizzleUsageCounter(tx, ctx.tenantId, clock),
        audit: new DrizzleAuditLogger(tx, ctx, ids, clock),
        invitations: new DrizzleInvitationRepository(tx, ctx.tenantId),
        members: new DrizzleMembershipRepository(tx, ctx.tenantId),
        settings: new DrizzleTenantSettingsRepository(tx, ctx.tenantId),
        suppliers: new DrizzleSupplierRepository(tx, ctx.tenantId),
        goodsReceipts: new DrizzleGoodsReceiptRepository(tx, ctx.tenantId),
      });
    });
  }
}
