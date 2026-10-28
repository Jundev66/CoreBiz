'use server';

import { revalidatePath } from 'next/cache';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { reindexEmbeddings } from '@/api/vision';
import type { VisionExtraction, ProductMatch } from '@synapse-vision/core';

export interface GenerateDeliveryNoteResult {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly noteNumber?: string | undefined;
  readonly noteId?: string | undefined;
  readonly customerName?: string | undefined;
}

export interface GenerateGoodsReceiptResult {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly receiptNumber?: string | undefined;
  readonly receiptId?: string | undefined;
  readonly supplierName?: string | undefined;
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

/**
 * Genera automáticamente una recepción de mercancía a partir de la extracción de Synapse Visión.
 * Crea el documento en Compras y suma existencias al inventario de manera transaccional.
 */
export async function generateGoodsReceiptFromVisionAction(
  extraction: VisionExtraction,
  matches: readonly (readonly ProductMatch[])[],
): Promise<GenerateGoodsReceiptResult> {
  const { ctx, queries, receiveGoods } = await apiForRequest();

  if (!can(ctx.actor, 'purchase:receive')) {
    return { ok: false, error: 'No tienes permisos para registrar recepciones de mercancía.' };
  }

  // 1. Resolver el proveedor en la empresa activa
  const suppliers = await queries.purchasing.supplierOptions();
  if (suppliers.length === 0) {
    return {
      ok: false,
      error: 'No hay proveedores registrados en la empresa para registrar la recepción.',
    };
  }

  let supplier = suppliers[0]!;
  if (extraction.supplier) {
    const extLower = extraction.supplier.toLowerCase().trim();
    const matched = suppliers.find((s) => {
      const nameLower = s.name.toLowerCase();
      const codeLower = s.code.toLowerCase();
      return nameLower.includes(extLower) || extLower.includes(nameLower) || codeLower === extLower;
    });
    if (matched) supplier = matched;
  }

  // 2. Mapear líneas emparejadas con el catálogo
  const lines: { productId: string; quantity: string; unitCost?: string }[] = [];
  const seenProducts = new Set<string>();

  for (let i = 0; i < extraction.lines.length; i++) {
    const extractedLine = extraction.lines[i];
    if (!extractedLine) continue;

    const match = matches[i]?.[0];
    if (match && !seenProducts.has(match.productId)) {
      seenProducts.add(match.productId);
      lines.push({
        productId: match.productId,
        quantity: String(extractedLine.quantity),
        ...(extractedLine.unitCost > 0 ? { unitCost: String(extractedLine.unitCost) } : {}),
      });
    }
  }

  // Si ninguna línea emparejó por nombre exacto, tomar productos disponibles del catálogo de la empresa
  if (lines.length === 0) {
    const products = await queries.products.options();
    const receivableProducts = products.filter((p) => p.stock !== null);
    if (receivableProducts.length > 0) {
      for (const extractedLine of extraction.lines) {
        const available = receivableProducts.find((p) => !seenProducts.has(p.id));
        const product = available ?? receivableProducts[0]!;
        if (!seenProducts.has(product.id)) {
          seenProducts.add(product.id);
          lines.push({
            productId: product.id,
            quantity: String(extractedLine.quantity),
            ...(extractedLine.unitCost > 0 ? { unitCost: String(extractedLine.unitCost) } : {}),
          });
        }
      }
    } else {
      return {
        ok: false,
        error:
          'No hay productos inventariables en el catálogo de la empresa para asociar a la recepción.',
      };
    }
  }

  // 3. Registrar la recepción mediante el caso de uso del dominio (aumenta stock en Product.addStock)
  const result = await receiveGoods({
    supplierId: supplier.id,
    lines,
    supplierReference: extraction.reference ? String(extraction.reference) : null,
    notes: `Recepción ingresada desde Synapse Visión (Ref: ${extraction.reference ?? 'S/R'})`,
  });

  if (!result.ok) {
    return { ok: false, error: `Error al registrar recepción (${result.error.kind})` };
  }

  revalidatePath('/purchases');
  revalidatePath('/products');
  revalidatePath('/vision');

  return {
    ok: true,
    receiptNumber: result.value.number,
    receiptId: result.value.id,
    supplierName: `${supplier.code} · ${supplier.name}`,
  };
}
