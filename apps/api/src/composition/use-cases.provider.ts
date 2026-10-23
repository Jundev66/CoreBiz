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
  memoryVisionDocumentCache,
  systemClock,
  type AiGateway,
  type SecretBox,
  type TenantContext,
} from '@corebiz/application';
import {
  aesGcmSecretBox,
  cryptoTokenFactory,
  httpAiGateway,
  httpEmbeddingsGateway,
  httpVisionGateway,
} from '@corebiz/infrastructure';
import { loadEnv } from '../config/env';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../tokens';
import type { VisionEmbeddingsPort, VisionModelPort } from '@synapse-vision/core';
import type { Runtime } from './runtime.provider';

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

function assembleUseCases(runtime: Runtime, ctx: TenantContext) {
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
    receiveGoods: makeReceiveGoods(shared),
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
