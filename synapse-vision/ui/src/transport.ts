import type { VisionExtractRequest, VisionExtractResponse } from '@synapse-vision/core';
import { visionExtractResponseSchema } from '@synapse-vision/core';

/**
 * El contrato de transporte de la vista.
 *
 * El host implementa esto —por ejemplo con un `fetch` a su endpoint— y la vista no sabe
 * nada más. La respuesta SIEMPRE se valida contra el esquema antes de llegar a la UI: un
 * backend desalineado se ve como un error legible, no como datos rotos en pantalla.
 */
export interface VisionTransport {
  extract(request: VisionExtractRequest): Promise<VisionExtractResponse>;
}

export class VisionTransportError extends Error {
  readonly status?: number | undefined;
  readonly errorKind?: string | undefined;

  constructor(message: string, status?: number, errorKind?: string) {
    super(message);
    this.name = 'VisionTransportError';
    this.status = status;
    this.errorKind = errorKind;
  }
}

export interface FetchVisionTransportOptions {
  /** Endpoint HTTP del host que implementa el contrato. */
  endpoint: string;
  /** Cabeceras por petición (token, locale…). Se evalúan en cada llamada. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Permite sustituir `fetch` (SSR, tests, runtimes sin fetch global). */
  fetchImpl?: typeof fetch;
}

function defaultFriendlyErrorMessage(status: number, errorKind?: string): string {
  if (status === 400 || errorKind === 'InvalidFormat') {
    return 'El archivo no contiene un comprobante o nota de entrega reconocible.';
  }
  if (status === 413 || errorKind === 'PayloadTooLarge') {
    return 'El archivo seleccionado supera el tamaño máximo permitido.';
  }
  if (status === 403 || errorKind === 'Forbidden') {
    return 'No tienes permiso para utilizar la función de lectura de documentos.';
  }
  if (status === 504 || errorKind === 'AiTimeout') {
    return 'El procesamiento del documento tardó demasiado tiempo. Inténtalo de nuevo.';
  }
  if (status === 502 || (errorKind && errorKind.startsWith('Ai'))) {
    return 'No se pudo comunicar con el servicio de IA. Verifica la configuración o intenta más tarde.';
  }
  return 'Ocurrió un inconveniente al procesar el documento. Intenta con un archivo más claro o legible.';
}

/** Adaptador por defecto: un POST JSON al endpoint del host. */
export function createFetchVisionTransport(options: FetchVisionTransportOptions): VisionTransport {
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    async extract(request: VisionExtractRequest): Promise<VisionExtractResponse> {
      const extraHeaders = options.headers ? await options.headers() : {};
      const response = await doFetch(options.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const errorBody =
          payload && typeof payload === 'object'
            ? (payload as { errorKind?: string; message?: string })
            : null;

        const errorKind = errorBody?.errorKind;
        const message =
          errorBody?.message ?? defaultFriendlyErrorMessage(response.status, errorKind);

        throw new VisionTransportError(message, response.status, errorKind);
      }

      const payload: unknown = await response.json();
      const parsed = visionExtractResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new VisionTransportError(
          'El documento procesado no tiene una estructura de datos válida.',
        );
      }
      return parsed.data;
    },
  };
}
