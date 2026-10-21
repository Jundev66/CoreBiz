import { can, isRole, type Actor } from '@corebiz/domain';
import type {
  ProductMatch,
  VisionActorContext,
  VisionBridgePort,
  VisionEmbeddingsPort,
  VisionVectorStorePort,
} from '@synapse-vision/core';
import type { ProductQueries } from '../../queries/read-models';

/** Cuantos candidatos del catalogo basta con ofrecer por linea leida. */
const MAX_MATCHES = 5;
/** El catalogo busca por texto; una descripcion mas larga que esto no ayuda y cuesta. */
const MAX_SEARCH_CHARS = 60;
/**
 * Umbral de similitud coseno para aceptar una coincidencia semantica.
 *
 * Debajo de esto el vector es ruido, no una sugerencia. El numero es conservador a
 * proposito: una sugerencia mala es peor que ninguna, porque el humano la acepta.
 */
const MIN_SCORE = 0.35;

/**
 * Emparejamiento semantico opcional, inyectado por el composition root.
 *
 * Es opcional POR DISEÑO. Sin el —sin modelo de embeddings o sin almacen vectorial— el
 * puente sigue resolviendo por texto, que es el comportamiento de siempre. La busqueda
 * semantica mejora el resultado; nunca es un requisito para que la funcion responda.
 */
export interface VisionRag {
  readonly embeddings: VisionEmbeddingsPort;
  readonly store: VisionVectorStorePort;
}

/**
 * Conecta Synapse Vision con el catalogo y los permisos de CoreBiz.
 *
 * El paquete de vision no conoce ni la base de datos ni los permisos: este puente, que si
 * vive dentro de la aplicacion, traduce una descripcion leida de un documento a productos
 * del catalogo DEL TENANT ACTUAL —el modelo de lectura ya viene acotado por RLS— y decide,
 * con la misma funcion `can()` que usa el resto del sistema, quien puede dar de alta la
 * recepcion.
 *
 * Con RAG, la descripcion se compara por SIGNIFICADO contra el catalogo indexado; sin RAG
 * —o si la busqueda semantica falla— cae a la busqueda por texto. El fallo del proveedor
 * de embeddings NUNCA rompe la lectura: como mucho, degrada la calidad de la sugerencia.
 */
export class CoreBizVisionBridgeAdapter implements VisionBridgePort {
  readonly erpName = 'CoreBiz';
  readonly currency = 'USD';

  constructor(
    private readonly products: ProductQueries,
    private readonly rag?: VisionRag,
  ) {}

  canIngest(actor: VisionActorContext): boolean {
    return can(domainActorOf(actor), 'purchase:receive');
  }

  async matchProduct(
    actor: VisionActorContext,
    description: string,
  ): Promise<readonly ProductMatch[]> {
    const search = description.trim().slice(0, MAX_SEARCH_CHARS);
    if (search === '') return [];

    const semantic = await this.matchSemantic(actor, search);
    if (semantic !== null) return semantic;

    const page = await this.products.list({ search, limit: MAX_MATCHES });
    return page.items.map((product) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      // El host decide como puntua; el paquete solo transporta. Una coincidencia por texto
      // es una sugerencia, y el 0.5 lo dice: ni certeza ni descarte.
      confidence: 0.5,
    }));
  }

  /**
   * La busqueda semantica, o `null` para que el llamador use el texto.
   *
   * Devuelve `null` —no una lista vacia— cuando NO HAY RAG o cuando el proveedor falla:
   * "no pude buscar por significado" y "busque y no hay nada" son cosas distintas, y solo
   * la segunda deberia devolver pocos resultados. El store devuelve `entity_id`; el sku y
   * el nombre se resuelven contra el catalogo para no mostrar una ficha a medias.
   */
  private async matchSemantic(
    actor: VisionActorContext,
    search: string,
  ): Promise<readonly ProductMatch[] | null> {
    if (this.rag === undefined) return null;

    try {
      const [vector] = await this.rag.embeddings.embed({ texts: [search] });
      if (vector === undefined) return null;

      const hits = await this.rag.store.search(actor, {
        entityType: 'product',
        embedding: vector,
        limit: MAX_MATCHES,
        minScore: MIN_SCORE,
      });

      const matches: ProductMatch[] = [];
      for (const hit of hits) {
        const detail = await this.products.byId(hit.entityId);
        if (detail === null) continue;
        matches.push({
          productId: detail.id,
          sku: detail.sku,
          name: detail.name,
          confidence: hit.score,
        });
      }
      return matches;
    } catch {
      // Un proveedor de embeddings caido no puede tumbar la lectura de la nota.
      return null;
    }
  }

  async resolveSupplier(actor: VisionActorContext, name: string): Promise<string | null> {
    const search = name.trim().slice(0, MAX_SEARCH_CHARS);
    if (search === '' || this.rag === undefined) return null;

    try {
      const [vector] = await this.rag.embeddings.embed({ texts: [search] });
      if (vector === undefined) return null;

      const [hit] = await this.rag.store.search(actor, {
        entityType: 'supplier',
        embedding: vector,
        limit: 1,
        minScore: MIN_SCORE,
      });
      return hit?.entityId ?? null;
    } catch {
      // Sin RAG el host no resuelve el proveedor: el humano decide. `null` es honesto.
      return null;
    }
  }
}

/** El rol viaja como string en el contexto agnostico; aqui se estrecha al rol del dominio. */
function domainActorOf(actor: VisionActorContext): Actor {
  return {
    userId: actor.userId,
    role: isRole(actor.roleName) ? actor.roleName : 'viewer',
  };
}
