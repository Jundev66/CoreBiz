import { Scope, type FactoryProvider } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import {
  makeAdjustStock,
  makeChangeMemberRole,
  makeCreateCustomer,
  makeUpdateCustomer,
  makeCreateProduct,
  makeUpdateProduct,
  makeCreateSupplier,
  makeUpdateSupplier,
  makeInviteUser,
  makeRecordAuditExport,
  makeIssueDeliveryNote,
  makeMarkDelivered,
  makeReceiveCustomerPayment,
  makeVoidCustomerPayment,
  makeReceiveGoods,
  makeConfirmVisionReceipt,
  makeVoidGoodsReceipt,
  makeRemoveMember,
  makeRevokeInvitation,
  makeSetCustomerStatus,
  makeSetProductStatus,
  makeSetSupplierStatus,
  makeUpdateTenantSettings,
  makeVoidDeliveryNote,
  makeAskAssistant,
  makeAssistantStatus,
  makeExtractDeliveryNote,
  makeReindexVisionEmbeddings,
  makeGetAiSettings,
  makeListAiModels,
  makeRemoveAiSettings,
  makeSaveAiSettings,
  makeOpenCashShift,
  makeRecordCashMovement,
  makeCloseCashShift,
  makeProcessPosSale,
  makeResolveInventoryConflict,
  PosCommandBus,
  OpenCashShiftCommandHandler,
  RecordCashMovementCommandHandler,
  CloseCashShiftCommandHandler,
  ProcessPosSaleCommandHandler,
  DirectPosSyncQueue,
  type PosSyncQueue,
  memoryVisionDocumentCache,
  systemClock,
  PostJournalEntryCommandHandler,
  GetTrialBalanceQueryHandler,
  ListAccountsQueryHandler,
  CreateAccountCommandHandler,
  ListJournalEntriesQueryHandler,
  IssueInvoiceCommandHandler,
  ApplyInvoicePaymentCommandHandler,
  CreateCollectionReceiptCommandHandler,
  VoidCollectionReceiptCommandHandler,
  IssueCreditNoteCommandHandler,
  IssueDebitNoteCommandHandler,
  ListCreditNotesQueryHandler,
  ListDebitNotesQueryHandler,
  ListInvoicesQueryHandler,
  ListInvoiceReceiptsQueryHandler,
  GenerateSalesBookQueryHandler,
  GeneratePurchasesBookQueryHandler,
  GenerateUsTaxSummaryQueryHandler,
  ImportBankStatementCommandHandler,
  MatchReconciliationCommandHandler,
  RecordBankAdjustmentCommandHandler,
  GetReconciliationStatusQueryHandler,
  ListBankStatementsQueryHandler,
  RunForexRevaluationCommandHandler,
  GetForexExposureQueryHandler,
  ExecuteTreasurySwapCommandHandler,
  ListTreasurySwapsQueryHandler,
  RecordPartnerCashDrawingCommandHandler,
  RecordPartnerStockDrawingCommandHandler,
  ListPartnerDrawingsQueryHandler,
  RecordDisbursementCommandHandler,
  ListDisbursementsQueryHandler,
  CreateWarehouseCommandHandler,
  InitiateTransferCommandHandler,
  ReceiveTransferCommandHandler,
  CancelTransferCommandHandler,
  ListWarehousesQueryHandler,
  ListTransfersQueryHandler,
  GetWarehouseStockQueryHandler,
  CreateInventoryAuditCommandHandler,
  RecordAuditCountsCommandHandler,
  ApproveInventoryAuditCommandHandler,
  CancelInventoryAuditCommandHandler,
  ListInventoryAuditsQueryHandler,
  GetInventoryAuditDetailsQueryHandler,
  GetArAgingReportQueryHandler,
  GetApAgingReportQueryHandler,
  type AiGateway,
  type PurchaseRecordedEvent,
  type SecretBox,
  type TenantContext,
} from '@corebiz/application';
import {
  aesGcmSecretBox,
  cryptoTokenFactory,
  httpAiGateway,
  httpEmbeddingsGateway,
  httpVisionGateway,
  BullMqPosSyncQueue,
} from '@corebiz/infrastructure';
import {
  CreateFiscalSequenceRangeCommandHandler,
  ListFiscalSequenceRangesQueryHandler,
  FiscalSequenceGuard,
  IssueWithholdingVoucherCommandHandler,
  VoidWithholdingVoucherCommandHandler,
  ListWithholdingVouchersQueryHandler,
  resolveFiscalCurrency,
  computeConvertedMinor,
} from '@corebiz/fiscal';
import { JournalEntry, JournalEntryLine, Money } from '@corebiz/domain';
import { loadEnv } from '../config/env';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../tokens';
import type { VisionEmbeddingsPort, VisionModelPort } from '@synapse-vision/core';
import type { Runtime } from './runtime.provider';
import {
  listMemoryPurchaseBookTransactions,
  recordMemoryPurchaseBookTransaction,
} from './memory-driver';

/**
 * Los casos de uso, ya inyectados.
 *
 * Es el bloque de retorno de `forRequest()` tal cual estaba. No se refactoriza en esta
 * migracion a proposito: cuando cambian a la vez el framework y la forma de montar las
 * dependencias, un fallo no dice cual de las dos cosas lo causo.
 *
 * Devolver funciones ya inyectadas —en lugar de un contenedor consultable— hace que
 * la llamada quede tipada y que no exista forma de pedir algo que no se ha montado.
 */
/**
 * The AI adapters hold no per-request state, so they are built once per process. Lazily,
 * because `loadEnv()` must not run at import time in tests that set the environment later.
 */
let aiAdapters: {
  gateway: AiGateway;
  vision: VisionModelPort;
  secrets: SecretBox;
  /**
   * El proveedor de embeddings, o `null` si este despliegue no tiene busqueda semantica
   * configurada. NO es una lista vacia ni un adaptador que falla: es "no hay RAG", y el
   * puente lo distingue para caer a la busqueda por texto.
   */
  embeddings: VisionEmbeddingsPort | null;
} | null = null;
const sharedVisionCache = memoryVisionDocumentCache();
function ai() {
  if (aiAdapters === null) {
    const env = loadEnv();
    aiAdapters = {
      gateway: httpAiGateway({ allowPrivateBaseUrls: env.AI_ALLOW_PRIVATE_BASE_URLS }),
      vision: httpVisionGateway({ allowPrivateBaseUrls: env.AI_ALLOW_PRIVATE_BASE_URLS }),
      secrets: aesGcmSecretBox(env.AI_KEY_ENCRYPTION_KEY),
      embeddings:
        env.VISION_EMBEDDINGS_BASE_URL === undefined
          ? null
          : httpEmbeddingsGateway({
              baseUrl: env.VISION_EMBEDDINGS_BASE_URL,
              apiKey: env.VISION_EMBEDDINGS_API_KEY ?? null,
              model: env.VISION_EMBEDDINGS_MODEL,
              dimensions: env.VISION_EMBEDDINGS_DIMENSIONS,
              allowPrivateBaseUrls: env.AI_ALLOW_PRIVATE_BASE_URLS,
            }),
    };
  }
  return aiAdapters;
}

export function assembleUseCases(runtime: Runtime, ctx: TenantContext) {
  const shared = {
    uow: runtime.uow,
    ctx,
    clock: systemClock,
    ids: { next: () => uuidv7() },
  };

  // Los tokens de invitacion se generan con `randomBytes`, no con Math.random: un
  // token predecible es una puerta abierta a la empresa que lo espera.
  const withTokens = { ...shared, tokens: cryptoTokenFactory() };

  const withAi = { ...shared, ...ai() };

  // Vision lee del catalogo (read models) ademas de la conexion de IA. El lado de lectura
  // ya viene acotado por el tenant de la peticion. Los puertos de RAG son OPCIONALES: se
  // incluyen solo cuando existen, para que `exactOptionalPropertyTypes` no reciba un
  // `undefined` explicito y para que el puente pueda distinguir "no hay RAG".
  const embeddings = ai().embeddings;
  const vectorStore = runtime.vectorStore;
  const withVision = {
    ...shared,
    secrets: ai().secrets,
    model: ai().vision,
    queries: runtime.queries,
    cache: sharedVisionCache,
    ...(embeddings !== null ? { embeddings } : {}),
    ...(vectorStore !== undefined ? { vectorStore } : {}),
  };

  const issueInvoice = new IssueInvoiceCommandHandler(runtime.invoices, runtime.journalEntries);

  const withPosInvoice = {
    ...shared,
    onSaleProcessed: async (event: {
      sale: {
        id: string;
        ticketNumber: string;
        occurredAt: Date;
      };
      customerId: string;
      lines: readonly {
        id: string;
        description: string;
        quantity: string;
        unitPriceMinor: bigint;
        productId?: string | undefined;
        revenueAccountId?: string | undefined;
      }[];
    }) => {
      const existing = await runtime.invoices.findById(ctx.tenantId, event.sale.id);
      if (existing) return;

      const accounts = await runtime.accounts.listByTenant(ctx.tenantId).catch(() => []);
      const findAccount = (codes: string[], fallbackCategory: string, fallbackId: string) =>
        accounts.find((a) => codes.includes(a.code.value))?.id ??
        accounts.find((a) => a.category === fallbackCategory)?.id ??
        fallbackId;

      const receivableAccountId = findAccount(['1.1.02', '1200'], 'ASSET', 'tpl-1.1.02');
      const revenueAccountId = findAccount(['4.1.01', '4010'], 'REVENUE', 'tpl-4.1.01');
      const taxPayableAccountId = findAccount(['2.1.02', '2050'], 'LIABILITY', 'tpl-2.1.02');
      const cashAccountId = findAccount(['1.1.01', '1010'], 'ASSET', 'tpl-1.1.01');

      const invoiceRes = await issueInvoice.execute({
        id: event.sale.id,
        tenantId: ctx.tenantId,
        customerId: event.customerId,
        documentType: 'STANDARD',
        documentNumber: event.sale.ticketNumber,
        issueDate: event.sale.occurredAt,
        dueDate: event.sale.occurredAt,
        currency: ctx.settings.baseCurrency,
        receivableAccountId,
        revenueAccountId,
        taxPayableAccountId,
        cashAccountId,
        paymentCondition: 'CASH',
        lines: event.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          taxPercentage: ctx.settings.taxRateBp / 100,
          productId: l.productId,
          revenueAccountId: l.revenueAccountId,
        })),
      });
      if (!invoiceRes.ok) {
        console.error('[POS -> IssueInvoice] Failed:', invoiceRes.error);
      }
    },
  };

  const withPurchaseAccounting = {
    ...shared,
    onPurchaseRecorded: async (event: PurchaseRecordedEvent) => {
      const subtotalMinor = event.receipt.total.minorUnits;
      const taxBp = Math.round(event.taxPercentage * 100);
      const taxMinor = (subtotalMinor * BigInt(taxBp)) / 10000n;
      const totalWithTaxMinor = subtotalMinor + taxMinor;
      const currency = event.receipt.currency;

      const accounts = await runtime.accounts.listByTenant(ctx.tenantId).catch(() => []);
      const findAccount = (codes: string[], fallbackCategory: string, fallbackId: string) =>
        accounts.find((a) => codes.includes(a.code.value))?.id ??
        accounts.find((a) => a.category === fallbackCategory)?.id ??
        fallbackId;

      const inventoryAccountId = findAccount(['1.1.04', '5.1.01'], 'ASSET', 'tpl-1.1.04');
      const taxCreditAccountId = findAccount(['1.1.05', '2.1.02'], 'ASSET', 'tpl-2.1.02');
      const cashAccountId = findAccount(['1.1.01', '1010'], 'ASSET', 'tpl-1.1.01');
      const payableAccountId = findAccount(['2.1.01', '2010'], 'LIABILITY', 'tpl-2.1.01');

      const docRef = event.supplierReference || event.receipt.number;
      const lines: JournalEntryLine[] = [];

      const invDebit = JournalEntryLine.create(
        inventoryAccountId,
        Money.fromMinor(subtotalMinor, currency),
        Money.zero(currency),
        `Purchase inventory - ${docRef}`,
      );
      if (invDebit.ok) lines.push(invDebit.value);

      if (taxMinor > 0n) {
        const taxDebit = JournalEntryLine.create(
          taxCreditAccountId,
          Money.fromMinor(taxMinor, currency),
          Money.zero(currency),
          `Purchase tax credit - ${docRef}`,
        );
        if (taxDebit.ok) lines.push(taxDebit.value);
      }

      const creditAccountId =
        event.paymentCondition === 'CREDIT' ? payableAccountId : cashAccountId;
      const creditLine = JournalEntryLine.create(
        creditAccountId,
        Money.zero(currency),
        Money.fromMinor(totalWithTaxMinor, currency),
        event.paymentCondition === 'CREDIT'
          ? `Accounts payable - ${docRef}`
          : `Cash purchase - ${docRef}`,
      );
      if (creditLine.ok) lines.push(creditLine.value);

      if (lines.length >= 2) {
        const entryNumber = await runtime.journalEntries.nextEntryNumber(ctx.tenantId);
        const jeResult = JournalEntry.create({
          id: `pur-je-${event.receipt.id}-${entryNumber}`,
          tenantId: ctx.tenantId,
          entryNumber,
          date: event.receipt.receivedAt ?? new Date(),
          description: `Purchase invoice ${docRef} (${event.supplier.name})`,
          sourceType: 'PURCHASE',
          sourceId: event.receipt.id,
          lines,
        });
        if (jeResult.ok) {
          await runtime.journalEntries.save(jeResult.value);
        }
      }

      const issueDate = event.receipt.receivedAt ?? new Date();
      if (event.paymentCondition === 'CREDIT' && runtime.payableBills) {
        const adapter = runtime.payableBills as unknown as {
          addBill?: (item: {
            readonly id: string;
            readonly tenantId: string;
            readonly supplierId: string;
            readonly supplierName: string;
            readonly taxId?: string | undefined;
            readonly billNumber: string;
            readonly issueDate: Date;
            readonly dueDate: Date;
            readonly total: Money;
            readonly paidAmount: Money;
            readonly remainingBalance: Money;
            readonly status: string;
          }) => void;
        };
        if (typeof adapter.addBill === 'function') {
          const dueDate = new Date(issueDate.getTime() + event.creditDays * 86_400_000);
          const totalMoney = Money.fromMinor(totalWithTaxMinor, currency);
          adapter.addBill({
            id: event.receipt.id,
            tenantId: ctx.tenantId,
            supplierId: event.supplier.id,
            supplierName: event.supplier.name,
            taxId: event.supplier.taxId ?? undefined,
            billNumber: docRef,
            issueDate,
            dueDate,
            total: totalMoney,
            paidAmount: Money.zero(currency),
            remainingBalance: totalMoney,
            status: 'ISSUED',
          });
        }
      }

      const fiscalCurrency = resolveFiscalCurrency(ctx.settings.fiscalCountry ?? 'VE');
      const parsedRate = Number((event.appliedRate || event.officialRate || '1').replace(',', '.'));
      const effectiveRate =
        currency !== fiscalCurrency && Number.isFinite(parsedRate) && parsedRate > 0
          ? parsedRate
          : 1;

      const bookSubtotal =
        effectiveRate !== 1 ? computeConvertedMinor(subtotalMinor, effectiveRate) : subtotalMinor;
      const bookTax =
        effectiveRate !== 1 ? computeConvertedMinor(taxMinor, effectiveRate) : taxMinor;
      const bookTotal = bookSubtotal + bookTax;

      recordMemoryPurchaseBookTransaction(ctx.tenantId, {
        receiptId: event.receipt.id,
        receiptDate: issueDate,
        supplierTaxId: event.supplier.taxId ?? 'J-00000000-0',
        supplierName: event.supplier.name,
        documentNumber: docRef,
        controlNumber: event.controlNumber ?? undefined,
        documentType: 'FACTURA',
        totalMinor: bookTotal,
        exemptMinor: taxMinor === 0n ? bookTotal : 0n,
        taxableBaseGeneralMinor: taxMinor > 0n ? bookSubtotal : 0n,
        taxGeneralMinor: bookTax,
        taxGeneralPercentage: event.taxPercentage,
        vatWithheldMinor: 0n,
        currency: effectiveRate !== 1 ? fiscalCurrency : currency,
      });
    },
  };

  return {
    createCustomer: makeCreateCustomer(shared),
    updateCustomer: makeUpdateCustomer(shared),
    setCustomerStatus: makeSetCustomerStatus(shared),
    createProduct: makeCreateProduct(shared),
    updateProduct: makeUpdateProduct(shared),
    adjustStock: makeAdjustStock(shared),
    setProductStatus: makeSetProductStatus(shared),
    issueDeliveryNote: makeIssueDeliveryNote(shared),
    // Almacen puede confirmar la entrega aunque no pueda emitir ni anular: es el unico
    // punto donde ese rol actua sobre un documento de venta, y es deliberado. Quien
    // mueve las cajas es quien sabe que llegaron.
    markDelivered: makeMarkDelivered(shared),
    voidDeliveryNote: makeVoidDeliveryNote(shared),
    receiveCustomerPayment: makeReceiveCustomerPayment(shared),
    voidCustomerPayment: makeVoidCustomerPayment(shared),

    // Administracion.
    inviteUser: makeInviteUser(withTokens),
    changeMemberRole: makeChangeMemberRole(shared),
    removeMember: makeRemoveMember(shared),
    revokeInvitation: makeRevokeInvitation(shared),
    updateTenantSettings: makeUpdateTenantSettings(shared),
    recordAuditExport: makeRecordAuditExport(shared),

    // Compras. El gate del modulo vive en el caso de uso, no en la ruta ni en el guard:
    // una Server Action se puede invocar directamente.
    createSupplier: makeCreateSupplier(shared),
    updateSupplier: makeUpdateSupplier(shared),
    setSupplierStatus: makeSetSupplierStatus(shared),
    receiveGoods: makeReceiveGoods(withPurchaseAccounting),
    confirmVisionReceipt: makeConfirmVisionReceipt(shared),
    voidGoodsReceipt: makeVoidGoodsReceipt(shared),

    // AI assistant. Settings are owner/admin; asking is open to every role.
    getAiSettings: makeGetAiSettings(withAi),
    listAiModels: makeListAiModels(withAi),
    saveAiSettings: makeSaveAiSettings(withAi),
    removeAiSettings: makeRemoveAiSettings(withAi),
    assistantStatus: makeAssistantStatus(withAi),
    askAssistant: makeAskAssistant(withAi),

    // Synapse Vision: leer una nota de entrega de una imagen. Siempre responde; sin IA
    // configurada devuelve el modo demo.
    extractDeliveryNote: makeExtractDeliveryNote(withVision),
    // (Re)construir el indice vectorial del catalogo. Solo owner/admin.
    reindexVisionEmbeddings: makeReindexVisionEmbeddings(withVision),

    // POS Offline.
    openCashShift: makeOpenCashShift(shared),
    recordCashMovement: makeRecordCashMovement(shared),
    closeCashShift: makeCloseCashShift(shared),
    processPosSale: makeProcessPosSale(withPosInvoice),
    resolveInventoryConflict: makeResolveInventoryConflict(shared),
    posCommandBus: (() => {
      const bus = new PosCommandBus();
      bus.register(new OpenCashShiftCommandHandler(shared));
      bus.register(new RecordCashMovementCommandHandler(shared));
      bus.register(new CloseCashShiftCommandHandler(shared));
      bus.register(new ProcessPosSaleCommandHandler(withPosInvoice));
      return bus;
    })(),
    posSyncQueue: ((): PosSyncQueue => {
      const redisUrl = process.env.REDIS_URL;
      if (process.env.QUEUE_DRIVER === 'bullmq' && redisUrl && redisUrl.trim().length > 0) {
        return new BullMqPosSyncQueue({ redisUrl });
      }
      return new DirectPosSyncQueue();
    })(),

    postJournalEntry: new PostJournalEntryCommandHandler(runtime.accounts, runtime.journalEntries),
    getTrialBalance: new GetTrialBalanceQueryHandler(runtime.accounts, runtime.journalEntries),
    listAccounts: new ListAccountsQueryHandler(runtime.accounts),
    createAccount: new CreateAccountCommandHandler(runtime.accounts),
    listJournalEntries: new ListJournalEntriesQueryHandler(runtime.journalEntries),
    issueInvoice,
    applyInvoicePayment: new ApplyInvoicePaymentCommandHandler(
      runtime.invoices,
      runtime.journalEntries,
    ),
    createCollectionReceipt: new CreateCollectionReceiptCommandHandler(
      runtime.paymentReceipts!,
      runtime.invoices,
      runtime.journalEntries,
    ),
    voidCollectionReceipt: new VoidCollectionReceiptCommandHandler(
      runtime.paymentReceipts!,
      runtime.invoices,
      runtime.journalEntries,
    ),
    listInvoices: new ListInvoicesQueryHandler(runtime.invoices),
    listInvoiceReceipts: new ListInvoiceReceiptsQueryHandler(runtime.paymentReceipts!),
    issueCreditNote: new IssueCreditNoteCommandHandler(
      runtime.creditNotes!,
      runtime.invoices,
      runtime.journalEntries,
    ),
    issueDebitNote: new IssueDebitNoteCommandHandler(
      runtime.debitNotes!,
      runtime.invoices,
      runtime.journalEntries,
    ),
    listCreditNotes: new ListCreditNotesQueryHandler(runtime.creditNotes!),
    listDebitNotes: new ListDebitNotesQueryHandler(runtime.debitNotes!),
    generateSalesBook: new GenerateSalesBookQueryHandler(runtime.invoices),
    generatePurchasesBook: new GeneratePurchasesBookQueryHandler(undefined, (tenantId) =>
      Promise.resolve(listMemoryPurchaseBookTransactions(tenantId)),
    ),
    generateUsTaxSummary: new GenerateUsTaxSummaryQueryHandler(runtime.invoices),
    importBankStatement: new ImportBankStatementCommandHandler(
      runtime.accounts,
      runtime.bankStatements,
    ),
    matchReconciliation: new MatchReconciliationCommandHandler(
      runtime.bankStatements,
      runtime.journalEntries,
    ),
    recordBankAdjustment: new RecordBankAdjustmentCommandHandler(
      runtime.bankStatements,
      runtime.accounts,
      runtime.journalEntries,
    ),
    getReconciliationStatus: new GetReconciliationStatusQueryHandler(
      runtime.bankStatements,
      runtime.journalEntries,
    ),
    listBankStatements: new ListBankStatementsQueryHandler(runtime.bankStatements),
    runForexRevaluation: new RunForexRevaluationCommandHandler(
      runtime.accounts,
      runtime.journalEntries,
    ),
    getForexExposure: new GetForexExposureQueryHandler(runtime.accounts, runtime.journalEntries),
    executeTreasurySwap: new ExecuteTreasurySwapCommandHandler(
      runtime.accounts,
      runtime.journalEntries,
      runtime.treasurySwaps!,
    ),
    listTreasurySwaps: new ListTreasurySwapsQueryHandler(runtime.treasurySwaps!),
    recordPartnerCashDrawing: new RecordPartnerCashDrawingCommandHandler(
      runtime.accounts,
      runtime.journalEntries,
      runtime.partnerDrawings!,
    ),
    recordPartnerStockDrawing: new RecordPartnerStockDrawingCommandHandler(
      runtime.accounts,
      runtime.journalEntries,
      runtime.partnerDrawings!,
    ),
    listPartnerDrawings: new ListPartnerDrawingsQueryHandler(runtime.partnerDrawings!),
    recordDisbursement: new RecordDisbursementCommandHandler(
      runtime.accounts,
      runtime.journalEntries,
      runtime.disbursements!,
    ),
    listDisbursements: new ListDisbursementsQueryHandler(runtime.disbursements!),
    createFiscalSequenceRange: new CreateFiscalSequenceRangeCommandHandler(
      runtime.fiscalSequenceRanges!,
    ),
    listFiscalSequenceRanges: new ListFiscalSequenceRangesQueryHandler(
      runtime.fiscalSequenceRanges!,
    ),
    fiscalSequenceGuard: new FiscalSequenceGuard(runtime.fiscalSequenceRanges!),
    issueWithholdingVoucher: new IssueWithholdingVoucherCommandHandler(
      runtime.withholdingVouchers!,
    ),
    voidWithholdingVoucher: new VoidWithholdingVoucherCommandHandler(runtime.withholdingVouchers!),
    listWithholdingVouchers: new ListWithholdingVouchersQueryHandler(runtime.withholdingVouchers!),
    createWarehouse: new CreateWarehouseCommandHandler(runtime.warehouses!),
    initiateTransfer: new InitiateTransferCommandHandler(runtime.transfers!, runtime.warehouses!),
    receiveTransfer: new ReceiveTransferCommandHandler(runtime.transfers!, runtime.warehouses!),
    cancelTransfer: new CancelTransferCommandHandler(runtime.transfers!, runtime.warehouses!),
    listWarehouses: new ListWarehousesQueryHandler(runtime.warehouses!),
    listTransfers: new ListTransfersQueryHandler(runtime.transfers!),
    getWarehouseStock: new GetWarehouseStockQueryHandler(runtime.warehouses!),
    createInventoryAudit: new CreateInventoryAuditCommandHandler(
      runtime.physicalInventoryAudits!,
      runtime.warehouses!,
    ),
    recordAuditCounts: new RecordAuditCountsCommandHandler(runtime.physicalInventoryAudits!),
    approveInventoryAudit: new ApproveInventoryAuditCommandHandler(
      runtime.physicalInventoryAudits!,
      runtime.warehouses!,
      runtime.journalEntries,
    ),
    cancelInventoryAudit: new CancelInventoryAuditCommandHandler(runtime.physicalInventoryAudits!),
    listInventoryAudits: new ListInventoryAuditsQueryHandler(runtime.physicalInventoryAudits!),
    getInventoryAuditDetails: new GetInventoryAuditDetailsQueryHandler(
      runtime.physicalInventoryAudits!,
    ),
    getArAgingReport: new GetArAgingReportQueryHandler(runtime.receivableInvoices!),
    getApAgingReport: new GetApAgingReportQueryHandler(runtime.payableBills!),
  } as const;
}

export const useCasesProvider: FactoryProvider = {
  provide: USE_CASES,
  scope: Scope.REQUEST,
  inject: [RUNTIME, TENANT_CONTEXT],
  useFactory: assembleUseCases,
};

/**
 * El tipo se saca de la funcion y NO del provider.
 *
 * `FactoryProvider.useFactory` esta declarado como `(...args: any[]) => any`, asi que
 * `ReturnType<typeof provider.useFactory>` es `any` — y con el, cada `this.useCases.x()`
 * de los seis controllers dejaba de comprobarse. Compilaba en verde y no verificaba
 * nada: exactamente el tipo de agujero que el resto del proyecto evita.
 */
export type UseCases = ReturnType<typeof assembleUseCases>;
