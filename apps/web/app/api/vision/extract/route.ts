import { visionExtractRequestSchema } from '@synapse-vision/core';
import { extractDeliveryNote } from '@/api/vision';

/**
 * Proxy al endpoint de vision de la API.
 *
 * La vista (`VisionAssistant`) hace `fetch('/api/vision/extract')` desde el navegador: no
 * puede llamar a la API directo porque el token vive en una cookie `httpOnly` y no hay
 * CORS (ADR 006). Esta ruta es el unico puente, y reenvia el cuerpo ya validado al caso de
 * uso de la API reutilizando el cliente de servidor (`extractDeliveryNote`).
 *
 * El cuerpo se valida aqui contra el mismo esquema que usa la API antes de reenviarlo:
 * rechazar un `mimeType` o un base64 de forma imposible en el borde evita gastar una
 * invocacion de funcion en algo que no puede ser un documento.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Estado HTTP a partir del tipo de fallo de la API, para que el navegador pueda reaccionar. */
function statusFor(kind: string): number {
  if (kind === 'Forbidden') return 403;
  if (kind === 'InvalidFormat') return 400;
  if (kind === 'PayloadTooLarge') return 413;
  if (kind === 'AiTimeout') return 504;
  if (kind === 'AiRateLimited') return 429;
  if (kind === 'AiKeyRejected') return 422;
  if (kind === 'AiModelUnavailable') return 422;
  if (kind.startsWith('Ai')) return 502;
  return 500;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const parsed = visionExtractRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return Response.json(
        {
          errorKind: 'InvalidFormat',
          message: 'El formato o archivo seleccionado no es válido para procesar.',
        },
        { status: 400 },
      );
    }

    // Las funciones serverless de Vercel imponen un tope estricto de cuerpo (~4.5 MB).
    if (parsed.data.imageBase64.length > 4_500_000) {
      return Response.json(
        {
          errorKind: 'PayloadTooLarge',
          message: 'El archivo supera el tamaño máximo permitido (3.5 MB).',
        },
        { status: 413 },
      );
    }

    const result = await extractDeliveryNote(parsed.data);

    if (!result.ok) {
      // El sobre que se devuelve es el mismo que espera cualquier error de la API: la vista
      // solo necesita saber que fallo, no el detalle interno.
      return Response.json(
        {
          errorKind: result.error.kind,
          params: result.error.params,
        },
        { status: statusFor(result.error.kind), headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(result.value, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        /timeout|timed out|abort/i.test(error.message));

    if (isTimeout) {
      return Response.json(
        {
          errorKind: 'AiTimeout',
          message: 'El procesamiento del documento tardó demasiado tiempo en responder.',
        },
        { status: 504, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      {
        errorKind: 'Unexpected',
        message: 'Ocurrió un inconveniente al procesar el archivo. Intenta de nuevo más tarde.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
