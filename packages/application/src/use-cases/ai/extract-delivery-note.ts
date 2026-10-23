import { AI_PROVIDER_TRAITS, can, effectiveBaseUrl, err, type Result } from '@corebiz/domain';
import type { AiSettingsRecord, SecretBox } from '../../ports/ai';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import type { ReadModels } from '../../queries/read-models';
import {
  VisionOrchestrator,
  type VisionActorContext,
  type VisionConnection,
  type VisionDocumentCachePort,
  type VisionEmbeddingsPort,
  type VisionError,
  type VisionExtractSuccess,
  type VisionImageInput,
  type VisionModelPort,
  type VisionVectorStorePort,
} from '@synapse-vision/core';
import {
  CoreBizVisionBridgeAdapter,
  type VisionRag,
} from '../../adapters/synapse-vision/corebiz-vision-bridge';

/**
 * Leer una nota de entrega desde una foto o un escaneo.
 *
 * Es el caso de uso que une las tres piezas: la configuracion de IA de la empresa (sellada
 * por tenant), el puente al catalogo, y el orquestador puro de Synapse Vision. El
 * orquestador decide solo el modo: con conexion y modelo, extrae por IA; sin conexion,
 * devuelve el documento y los datos de ejemplo —NUNCA un error por "no hay IA".
 *
 * El tenant NO viaja en el payload: sale de la sesion ya verificada (`ctx`) y de RLS. La
 * imagen tampoco se registra en ningun sitio; vive solo lo que dura la peticion.
 */

export interface ExtractDeliveryNoteDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  /** Sin modelo inyectado el orquestador queda en modo demo, no roto. */
  readonly model: VisionModelPort;
  readonly secrets: SecretBox;
  readonly queries: ReadModels;
  /**
   * Busqueda semantica opcional. Sin ella, el puente resuelve por texto. Se pasan las dos
   * piezas o ninguna: un vector store sin embeddings (o al reves) no sirve para nada, asi
   * que el composition root las entrega juntas o no entrega nada.
   */
  readonly embeddings?: VisionEmbeddingsPort;
  readonly vectorStore?: VisionVectorStorePort;
  readonly cache?: VisionDocumentCachePort;
}

export function makeExtractDeliveryNote(deps: ExtractDeliveryNoteDeps) {
  return async function extractDeliveryNote(
    image: VisionImageInput,
  ): Promise<Result<VisionExtractSuccess, VisionError>> {
    if (!can(deps.ctx.actor, 'assistant:use')) return err({ kind: 'Forbidden' });

    const record = await deps.uow.run((repos) => repos.aiSettings.find());
    const connection = connectionOf(record, deps);

    const rag = ragOf(deps);
    const bridge = new CoreBizVisionBridgeAdapter(
      deps.queries.products,
      ...(rag !== undefined ? [rag] : []),
    );
    const orchestrator = new VisionOrchestrator({
      bridge,
      model: deps.model,
      ...(deps.cache !== undefined ? { cache: deps.cache } : {}),
    });

    return orchestrator.extract(actorOf(deps.ctx), connection, image);
  };
}

/** RAG solo cuando estan las dos piezas; si falta una, se empareja por texto. */
function ragOf(deps: ExtractDeliveryNoteDeps): VisionRag | undefined {
  if (deps.embeddings === undefined || deps.vectorStore === undefined) return undefined;
  return { embeddings: deps.embeddings, store: deps.vectorStore };
}

/**
 * La conexion a usar, o `null` para quedarse en demo.
 *
 * Devuelve `null` —modo demo— en los tres casos en que no se puede hablar con un modelo sin
 * arriesgar nada: sin configuracion, con una clave que este despliegue ya no puede abrir, o
 * con un proveedor que exige clave y no la tiene. No es un fallo: es la capacidad mostrandose
 * con datos de ejemplo, tal y como promete el contrato del paquete.
 */
function connectionOf(
  record: AiSettingsRecord | null,
  deps: ExtractDeliveryNoteDeps,
): VisionConnection | null {
  if (record === null) return null;

  let apiKey: string | null = null;
  if (record.apiKeyCiphertext !== null) {
    apiKey = deps.secrets.open(record.apiKeyCiphertext, deps.ctx.tenantId);
    if (apiKey === null) return null;
  } else if (AI_PROVIDER_TRAITS[record.provider].requiresApiKey) {
    return null;
  }

  return {
    provider: record.provider,
    baseUrl: effectiveBaseUrl(record.provider, record.baseUrl),
    apiKey,
    model: record.model,
  };
}

function actorOf(ctx: TenantContext): VisionActorContext {
  return {
    userId: ctx.actor.userId,
    tenantId: ctx.tenantId,
    roleName: ctx.actor.role,
    permissions: [],
  };
}
