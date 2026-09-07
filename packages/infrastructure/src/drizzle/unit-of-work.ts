import { sql } from 'drizzle-orm';
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
import type { Tx } from './tx';

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
      });
    });
  }
}

/**
 * Fija quien esta operando, para que las politicas RLS puedan decidir.
 *
 * Las tres sentencias son LOCALES a la transaccion, y eso es lo mas importante
 * de todo este archivo. Con alcance de sesion, las variables quedarian pegadas a
 * la conexion, y Supavisor —el pooler, en modo transaccion— reutiliza esa misma
 * conexion para el siguiente request, que puede ser de OTRO TENANT. Seria una
 * fuga de datos entre clientes: intermitente, invisible en desarrollo y visible
 * solo bajo concurrencia. Ver docs/adr/005-aislamiento-multi-tenant.md.
 */
async function establishTenantContext(tx: Tx, ctx: TenantContext): Promise<void> {
  // Lo lee app.current_tenant().
  await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);

  // Lo lee auth.uid(). Es el mismo mecanismo que usa PostgREST, asi que las
  // politicas funcionan igual llamadas desde aqui que desde la API de Supabase.
  const claims = JSON.stringify({ sub: ctx.actor.userId, role: 'authenticated' });
  await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);

  // Sin cambiar de rol, la conexion opera como propietaria de las tablas. Aunque
  // `force row level security` la somete igualmente a las politicas, estas estan
  // escritas `to authenticated`: sin este cambio no aplicarian ninguna, y el
  // aislamiento seria una ilusion.
  await tx.execute(sql`set local role authenticated`);
}
