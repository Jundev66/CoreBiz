import { can, err, ok, type Result } from '@corebiz/domain';
import type {
  VisionActorContext,
  VisionEmbeddingsPort,
  VisionError,
  VisionVectorRecord,
  VisionVectorStorePort,
} from '@synapse-vision/core';
import type { TenantContext } from '../../ports/repositories';
import type { ReadModels } from '../../queries/read-models';

/**
 * (Re)construye el indice vectorial del catalogo para Synapse Vision.
 *
 * Es una operacion de ADMINISTRACION, no parte de una lectura: recorre el catalogo del
 * tenant, genera un vector por producto y por proveedor, y los guarda. Se re-ejecuta
 * cuando el catalogo cambia mucho, cuando se cambia de modelo de embeddings, o la
 * primera vez que se habilita la busqueda semantica.
 *
 * El indice es una DERIVACION del catalogo: si no existe, o esta a medias, lo unico que
 * ocurre es que el emparejamiento cae a texto. Reindexar no toca los datos de negocio.
 *
 * Todo corre acotado por el tenant del request (`ctx`): las lecturas pasan por los read
 * models, que ya van con RLS, y la escritura por el almacen vectorial, que fija
 * `app.tenant_id` dentro de su transaccion.
 */

/** Cuantos registros se leen por pagina del catalogo. */
const PAGE_SIZE = 200;
/** Cuantos textos se envian al proveedor de embeddings por llamada. */
const EMBED_BATCH = 64;

export interface ReindexVisionEmbeddingsDeps {
  readonly ctx: TenantContext;
  readonly queries: ReadModels;
  readonly embeddings?: VisionEmbeddingsPort;
  readonly vectorStore?: VisionVectorStorePort;
}

export interface ReindexVisionEmbeddingsReport {
  readonly products: number;
  readonly suppliers: number;
}

export function makeReindexVisionEmbeddings(deps: ReindexVisionEmbeddingsDeps) {
  return async function reindexVisionEmbeddings(): Promise<
    Result<ReindexVisionEmbeddingsReport, VisionError>
  > {
    if (!can(deps.ctx.actor, 'ai:configure')) return err({ kind: 'Forbidden' });

    const { embeddings, vectorStore } = deps;
    if (embeddings === undefined || vectorStore === undefined) {
      // No es un fallo del request: es que este despliegue no tiene busqueda semantica
      // configurada. El panel lo muestra como "no disponible", no como error tecnico.
      return err({ kind: 'AiNotConfigured' });
    }

    const actor = actorOf(deps.ctx);

    const products = await collect(
      (cursor) =>
        deps.queries.products.list({ limit: PAGE_SIZE, ...(cursor === null ? {} : { cursor }) }),
      (item) => ({ entityType: 'product', entityId: item.id, label: `${item.name} (${item.sku})` }),
    );

    const suppliers = await collect(
      (cursor) =>
        deps.queries.purchasing.suppliers({
          limit: PAGE_SIZE,
          ...(cursor === null ? {} : { cursor }),
        }),
      (item) => ({
        entityType: 'supplier',
        entityId: item.id,
        label: `${item.name} (${item.code})`,
      }),
    );

    await index(embeddings, vectorStore, actor, products);
    await index(embeddings, vectorStore, actor, suppliers);

    return ok({ products: products.length, suppliers: suppliers.length });
  };
}

/** Recorre todas las paginas del catalogo y arma los registros a indexar. */
async function collect<TItem>(
  page: (cursor: string | null) => Promise<{ items: readonly TItem[]; nextCursor: string | null }>,
  toRecord: (item: TItem) => Omit<VisionVectorRecord, 'embedding'>,
): Promise<readonly Omit<VisionVectorRecord, 'embedding'>[]> {
  const records: Omit<VisionVectorRecord, 'embedding'>[] = [];
  let cursor: string | null = null;

  for (;;) {
    const current: { items: readonly TItem[]; nextCursor: string | null } = await page(cursor);
    for (const item of current.items) records.push(toRecord(item));
    if (current.nextCursor === null) break;
    cursor = current.nextCursor;
  }

  return records;
}

/**
 * Embebe e indexa por lotes.
 *
 * En lotes y no de una vez: un catalogo grande en una sola llamada al proveedor es una
 * peticion enorme que puede tardar mas que el timeout. Si un lote falla, el error sube y
 * la operacion entera se reporta como fallida — un indice a medias se re-ejecuta sin
 * problema porque el upsert es idempotente.
 */
async function index(
  embeddings: VisionEmbeddingsPort,
  store: VisionVectorStorePort,
  actor: VisionActorContext,
  records: readonly Omit<VisionVectorRecord, 'embedding'>[],
): Promise<void> {
  for (let start = 0; start < records.length; start += EMBED_BATCH) {
    const batch = records.slice(start, start + EMBED_BATCH);
    const vectors = await embeddings.embed({ texts: batch.map((record) => record.label) });

    const withEmbeddings: VisionVectorRecord[] = [];
    batch.forEach((record, index) => {
      const embedding = vectors[index];
      if (embedding !== undefined) withEmbeddings.push({ ...record, embedding });
    });

    await store.upsert(actor, withEmbeddings);
  }
}

function actorOf(ctx: TenantContext): VisionActorContext {
  return {
    userId: ctx.actor.userId,
    tenantId: ctx.tenantId,
    roleName: ctx.actor.role,
    permissions: [],
  };
}
