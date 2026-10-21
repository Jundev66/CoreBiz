'use server';

import { revalidatePath } from 'next/cache';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { reindexEmbeddings } from '@/api/vision';
import type { VisionExtraction, ProductMatch } from '@synapse-vision/core';

export interface GenerateDeliveryNoteResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly noteNumber?: string;
  readonly noteId?: string;
  readonly customerName?: string;
}

export interface ReindexResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly products?: number;
  readonly suppliers?: number;
}

/**
 * Reindexa el catálogo para búsqueda semántica vectorial. Requiere permiso ai:configure.
 */
export async function reindexEmbeddingsAction(): Promise<ReindexResult> {
  const result = await reindexEmbeddings();
  if (!result.ok) {
    return { ok: false, error: result.error.kind };
  }
  revalidatePath('/vision');
  return {
    ok: true,
    products: result.value.products,
    suppliers: result.value.suppliers,
  };
}

/**
 * Genera automáticamente una nota de entrega a partir de la extracción de demostración de Synapse Vision.
 * Respeta la empresa (tenant), el usuario (actor), las tasas de cambio y el catálogo del tenant activo.
 */
export async function generateDeliveryNoteFromVisionAction(
  extraction: VisionExtraction,
  matches: readonly (readonly ProductMatch[])[],
): Promise<GenerateDeliveryNoteResult> {
  const { ctx, queries, issueDeliveryNote } = await apiForRequest();

  if (!can(ctx.actor, 'delivery_note:issue')) {
    return { ok: false, error: 'No tienes permisos para emitir notas de entrega.' };
  }

  // 1. Resolver el cliente para la nota de entrega en la empresa activa
  const customers = await queries.customers.options();
  if (customers.length === 0) {
    return { ok: false, error: 'No hay clientes registrados en la empresa para emitir la nota.' };
  }
  const customer = customers[0]!;

  // 2. Mapear líneas emparejadas con el catálogo
  const lines: { productId: string; quantity: string; unitPrice?: string }[] = [];

  for (let i = 0; i < extraction.lines.length; i++) {
    const extractedLine = extraction.lines[i];
    if (!extractedLine) continue;

    // Buscar si tenemos coincidencia en el catálogo
    const match = matches[i]?.[0];
    if (match) {
      lines.push({
        productId: match.productId,
        quantity: String(extractedLine.quantity),
        unitPrice: String(extractedLine.unitCost),
      });
    }
  }

  // Si ninguna línea emparejó por nombre exacto, tomar productos disponibles del catálogo de la empresa
  if (lines.length === 0) {
    const products = await queries.products.options();
    if (products.length > 0) {
      for (const extractedLine of extraction.lines) {
        const product = products[lines.length % products.length]!;
        lines.push({
          productId: product.id,
          quantity: String(extractedLine.quantity),
          unitPrice: String(extractedLine.unitCost),
        });
      }
    } else {
      return {
        ok: false,
        error: 'No hay productos en el catálogo de la empresa para asociar a la nota.',
      };
    }
  }

  // 3. Emitir la nota de entrega mediante el caso de uso del dominio
  const result = await issueDeliveryNote({
    customerId: customer.id,
    lines,
    notes: `Generada automáticamente desde Synapse Vision (Demostración - Ref: ${extraction.reference})`,
  });

  if (!result.ok) {
    return { ok: false, error: `Error al emitir nota de entrega (${result.error.kind})` };
  }

  revalidatePath('/delivery-notes');
  revalidatePath('/vision');

  return {
    ok: true,
    noteNumber: result.value.number,
    noteId: result.value.id,
    customerName: `${customer.code} · ${customer.name}`,
  };
}
