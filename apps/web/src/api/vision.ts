import 'server-only';
import type { Result } from '@corebiz/domain';
import type { VisionExtractRequest, VisionExtractResponse } from '@synapse-vision/core';
import { send, SLOW_REQUEST_TIMEOUT_MS, type ApiFailure } from './client';

/**
 * La lectura de documentos, del lado del servidor.
 *
 * Igual que el resto de `src/api`: vive aqui y no en el navegador porque el token no sale
 * de una cookie `httpOnly` (ADR 006). El endpoint del navegador
 * (`app/api/vision/extract/route.ts`) es un proxy que llama a esto; la vista
 * (`@synapse-vision/ui`) no conoce ni la API ni la sesion, solo un endpoint propio.
 */

/**
 * Manda un documento a `POST /v1/vision/extract` y espera la extraccion validada.
 *
 * Plazo largo (`SLOW_REQUEST_TIMEOUT_MS`): si hay un modelo detras, la respuesta puede
 * tardar decenas de segundos. Sin proveedor, la API contesta en modo demostracion de
 * inmediato — nunca devuelve un error por "no hay IA", que es lo que permite que una
 * instalacion sin modelo siga mostrando la capacidad.
 *
 * Devuelve un `Result` y no lanza ante un error de negocio, como toda escritura de la
 * aplicacion: el proxy decide el estado HTTP a partir de `.error.kind`.
 */
export function extractDeliveryNote(
  input: VisionExtractRequest,
): Promise<Result<VisionExtractResponse, ApiFailure>> {
  return send<VisionExtractResponse>('POST', '/v1/vision/extract', input, {
    timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
  });
}

/**
 * Reconstruye el índice vectorial de productos y proveedores para búsqueda semántica en la empresa.
 */
export function reindexEmbeddings(): Promise<
  Result<{ readonly products: number; readonly suppliers: number }, ApiFailure>
> {
  return send<{ readonly products: number; readonly suppliers: number }>(
    'POST',
    '/v1/vision/embeddings/reindex',
    {},
    { timeoutMs: SLOW_REQUEST_TIMEOUT_MS },
  );
}
