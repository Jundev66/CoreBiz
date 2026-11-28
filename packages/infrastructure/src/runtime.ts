import { getPrisma } from '@corebiz/db';
import type {
  Clock,
  IdGenerator,
  ReadModels,
  TenantContext,
  UnitOfWork,
} from '@corebiz/application';
import type {
  AccountRepository,
  JournalEntryRepository,
  InvoiceRepository,
  BankStatementRepository,
} from '@corebiz/domain';
import { InMemoryBankStatementRepository } from '@corebiz/accounting/infrastructure';
import type { VisionVectorStorePort } from '@synapse-vision/core';
import { PrismaUnitOfWork } from './prisma/unit-of-work';
import type { AuditTrace } from './prisma/audit';
import { readOnly, withTenant } from './prisma/session';
import { prismaVisionVectorStore } from './prisma/vector-store';
import { prismaReadModels } from './queries/read-models';
import { PrismaAccountRepository } from './prisma/accounts';
import { PrismaJournalEntryRepository } from './prisma/journal-entries';
import { PrismaInvoiceRepository } from './prisma/invoices';
import {
  makePrismaDocumentPaymentStore,
  type DocumentPaymentStore,
} from './prisma/document-payments';

/**
 * Punto de entrada del adaptador de Postgres.
 *
 * Existe para que el composition root de la aplicacion no tenga que conocer ni
 * Drizzle ni el esquema: pide un runtime con una URL y recibe los puertos ya
 * montados. Es lo que mantiene honesta la regla `ui-no-direct-db`.
 */

export interface PostgresRuntimeDeps {
  readonly url: string;
  readonly ctx: TenantContext;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Verified email, IP hash and user agent, for audit rows. */
  readonly trace?: AuditTrace;
  /**
   * Modelo de embeddings activo, si hay RAG configurado. Sin el no se monta el almacen
   * vectorial y el emparejamiento de Synapse Vision se queda en la busqueda por texto:
   * la busqueda semantica es una mejora, no un requisito.
   */
  readonly vectorModel?: string;
}

export interface PostgresRuntime {
  readonly uow: UnitOfWork;
  readonly queries: ReadModels;
  readonly vectorStore?: VisionVectorStorePort;
  readonly accounts: AccountRepository;
  readonly journalEntries: JournalEntryRepository;
  readonly invoices: InvoiceRepository;
  readonly bankStatements: BankStatementRepository;
  readonly documentPayments: DocumentPaymentStore;
}

export function postgresRuntime(deps: PostgresRuntimeDeps): PostgresRuntime {
  const prisma = getPrisma(deps.url);

  return {
    uow: new PrismaUnitOfWork({
      prisma,
      ctx: deps.ctx,
      ids: deps.ids,
      clock: deps.clock,
      ...(deps.trace !== undefined ? { trace: deps.trace } : {}),
    }),
    queries: prismaReadModels(prisma, deps.ctx, deps.clock),
    accounts: {
      findById: (tenantId, id) =>
        readOnly(prisma, deps.ctx, (tx) => new PrismaAccountRepository(tx).findById(tenantId, id)),
      findByCode: (tenantId, code) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaAccountRepository(tx).findByCode(tenantId, code),
        ),
      listByTenant: (tenantId) =>
        readOnly(prisma, deps.ctx, (tx) => new PrismaAccountRepository(tx).listByTenant(tenantId)),
      save: (account) =>
        withTenant(prisma, deps.ctx, (tx) => new PrismaAccountRepository(tx).save(account)),
    },
    journalEntries: {
      findById: (tenantId, id) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaJournalEntryRepository(tx).findById(tenantId, id),
        ),
      nextEntryNumber: (tenantId) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaJournalEntryRepository(tx).nextEntryNumber(tenantId),
        ),
      save: (entry) =>
        withTenant(prisma, deps.ctx, (tx) => new PrismaJournalEntryRepository(tx).save(entry)),
      listByDateRange: (tenantId, startDate, endDate) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaJournalEntryRepository(tx).listByDateRange(tenantId, startDate, endDate),
        ),
    },
    invoices: {
      findById: (tenantId, id) =>
        readOnly(prisma, deps.ctx, (tx) => new PrismaInvoiceRepository(tx).findById(tenantId, id)),
      findByNumber: (tenantId, documentType, documentNumber) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaInvoiceRepository(tx).findByNumber(tenantId, documentType, documentNumber),
        ),
      listByCustomer: (tenantId, customerId) =>
        readOnly(prisma, deps.ctx, (tx) =>
          new PrismaInvoiceRepository(tx).listByCustomer(tenantId, customerId),
        ),
      listByTenant: (tenantId) =>
        readOnly(prisma, deps.ctx, (tx) => new PrismaInvoiceRepository(tx).listByTenant(tenantId)),
      save: (invoice) =>
        withTenant(prisma, deps.ctx, (tx) => new PrismaInvoiceRepository(tx).save(invoice)),
    },
    bankStatements: new InMemoryBankStatementRepository(),
    documentPayments: makePrismaDocumentPaymentStore(prisma, deps.ctx),
    ...(deps.vectorModel !== undefined
      ? { vectorStore: prismaVisionVectorStore(prisma, deps.ctx, { model: deps.vectorModel }) }
      : {}),
  };
}

export interface TenantProfile {
  readonly slug: string;
  readonly planCode: string;
  readonly role: string;
  readonly isDemo: boolean;
  /** Cuando desaparece el tenant, o null si no caduca. Solo los sandboxes caducan. */
  readonly expiresAt: Date | null;
  readonly taxLabel: string;
  readonly taxRateBp: number;
  readonly baseCurrency: string;
  readonly exchangeRateScaled: bigint | null;
  readonly exchangeRateAt: Date | null;
  readonly fiscalCountry?: 'VE' | 'US';
}

/**
 * Carga el perfil del tenant y el rol del usuario dentro de el.
 *
 * Se lee de la base de datos en lugar de codificarse en la aplicacion para que
 * cambiar el plan o la tasa de cambio en una fila tenga efecto de inmediato. Si
 * estos valores vivieran en el codigo, la pantalla diria una cosa y las politicas
 * otra en cuanto alguien tocase la tabla.
 *
 * Devuelve null si el usuario no pertenece al tenant. Distinguir "no existe" de
 * "no tienes acceso" seria filtrar la existencia de empresas ajenas.
 */
export async function loadTenantProfile(
  url: string,
  ctx: TenantContext,
): Promise<TenantProfile | null> {
  const prisma = getPrisma(url);

  return readOnly(prisma, ctx, async (tx) => {
    // El join se pide como relacion filtrada: solo interesa la empresa si el usuario tiene
    // en ella una membresia ACTIVA. Pedirlo asi, y no en dos consultas, evita el hueco en
    // el que la membresia se revoca entre una y otra.
    const row = await tx.tenants.findFirst({
      where: {
        id: ctx.tenantId,
        memberships: { some: { user_id: ctx.actor.userId, status: 'active' } },
      },
      include: {
        memberships: {
          where: { user_id: ctx.actor.userId, status: 'active' },
          select: { role: true },
          take: 1,
        },
      },
    });

    const role = row?.memberships[0]?.role;
    if (row === null || role === undefined) return null;

    return {
      slug: row.slug,
      planCode: row.plan_code,
      role,
      isDemo: row.is_demo,
      expiresAt: row.expires_at,
      taxLabel: row.tax_label ?? 'Impuesto informativo',
      taxRateBp: row.tax_rate_bp,
      baseCurrency: row.base_currency,
      exchangeRateScaled: row.exchange_rate_scaled,
      exchangeRateAt: row.exchange_rate_at,
      fiscalCountry: row.fiscal_country === 'US' ? 'US' : 'VE',
    };
  });
}
