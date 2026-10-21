import type { TenantContext } from '@corebiz/application';
import type { PrismaClient } from '@corebiz/prisma-client';
import type { VisionVectorMatch, VisionVectorStorePort } from '@synapse-vision/core';
import { readOnly, withTenant } from './session';

/**
 * El host de `VisionVectorStorePort` sobre pgvector.
 *
 * Toda consulta corre DENTRO de una transaccion con el contexto del tenant puesto:
 * `search` en una de solo lectura y `upsert` en una de escritura. No es ceremonia —
 * una busqueda vectorial fuera de esa transaccion no ve `app.tenant_id`, y RLS la
 * niega. Es la misma garantia que el resto de la persistencia, aqui aplicada a un
 * operador (`<=>`) que Prisma no expresa y que por eso va en SQL crudo.
 *
 * `model` viaja en cada fila y se filtra al buscar: cambiar de modelo de embeddings
 * no mezcla espacios vectoriales incomparables, simplemente no encuentra nada hasta
 * reindexar.
 */

export interface PrismaVisionVectorStoreOptions {
  /** Modelo de embeddings; debe coincidir con el que genero los vectores guardados. */
  readonly model: string;
}

export function prismaVisionVectorStore(
  prisma: PrismaClient,
  ctx: TenantContext,
  options: PrismaVisionVectorStoreOptions,
): VisionVectorStorePort {
  return {
    async search(actor, input): Promise<readonly VisionVectorMatch[]> {
      // El actor y el contexto del composition root son el mismo tenant por
      // construccion; si dejaran de serlo, no se sirve nada en vez de arriesgar una fuga.
      if (actor.tenantId !== ctx.tenantId) return [];

      const vector = toVectorLiteral(input.embedding);
      const minScore = input.minScore ?? 0;

      const rows = await readOnly(
        prisma,
        ctx,
        (tx) =>
          tx.$queryRaw<{ entity_id: string; label: string; score: number }[]>`
          select entity_id::text as entity_id,
                 label,
                 (1 - (embedding <=> ${vector}::extensions.vector)) as score
            from public.vision_embeddings
           where tenant_id = ${ctx.tenantId}::uuid
             and entity_type = ${input.entityType}
             and model = ${options.model}
             and (1 - (embedding <=> ${vector}::extensions.vector)) >= ${minScore}
           order by embedding <=> ${vector}::extensions.vector
           limit ${input.limit}
        `,
      );

      return rows.map((row): VisionVectorMatch => ({
        entityType: input.entityType,
        entityId: row.entity_id,
        label: row.label,
        score: Number(row.score),
      }));
    },

    async upsert(actor, records): Promise<void> {
      if (actor.tenantId !== ctx.tenantId) return;
      if (records.length === 0) return;

      await withTenant(prisma, ctx, async (tx) => {
        for (const record of records) {
          await tx.$executeRaw`
            insert into public.vision_embeddings
              (tenant_id, entity_type, entity_id, label, model, embedding, updated_at)
            values (
              ${ctx.tenantId}::uuid,
              ${record.entityType},
              ${record.entityId}::uuid,
              ${record.label},
              ${options.model},
              ${toVectorLiteral(record.embedding)}::extensions.vector,
              now()
            )
            on conflict (tenant_id, entity_type, entity_id) do update
              set label = excluded.label,
                  model = excluded.model,
                  embedding = excluded.embedding,
                  updated_at = now()
          `;
        }
      });
    },
  };
}

/**
 * Vector a literal textual para pgvector (`[1,2,3]`). El texto se castea en SQL a
 * `extensions.vector`; los numeros se comprueban aqui porque un `NaN` en el cast
 * seria un error de Postgres, no un dato invalido atrapable antes de la consulta.
 */
function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}
