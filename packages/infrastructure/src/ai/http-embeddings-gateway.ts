import type { VisionEmbeddingsPort } from '@synapse-vision/core';
import { isAllowedBaseUrl, resolveWithDns, type ResolveHost } from './url-guard';

/**
 * El host de `VisionEmbeddingsPort`: convierte texto en vectores hablando con un
 * proveedor OpenAI-compatible (`POST /v1/embeddings`).
 *
 * En este despliegue apunta al gateway `biz`, que traduce a su vez a Ollama
 * (`nomic-embed-text`, 768 dimensiones). El paquete de Vision declara el puerto y no
 * sabe nada de esto; el mensaje de error del proveedor NUNCA se propaga —un proveedor
 * a veces devuelve la clave o el texto de entrada en el error—: solo se lanza un error
 * con el estado HTTP.
 *
 * La dimension se declara y se COMPRUEBA contra cada vector devuelto. Un modelo que
 * devuelva otra dimension que la del esquema (que fija `vector(768)`) se detecta aqui,
 * al indexar, y no como un fallo de Postgres al insertar.
 */

export interface HttpEmbeddingsGatewayOptions {
  /** Raiz de la API, sin `/v1`: p. ej. `http://127.0.0.1:8000`. */
  readonly baseUrl: string;
  /** Clave del gateway (`biz_live_*`), o `null`/vacia si no exige. */
  readonly apiKey?: string | null;
  readonly model: string;
  readonly dimensions: number;
  /** `AI_ALLOW_PRIVATE_BASE_URLS`: solo desarrollo local y la suite. */
  readonly allowPrivateBaseUrls: boolean;
  readonly fetch?: typeof fetch;
  readonly resolve?: ResolveHost;
  readonly timeoutMs?: number;
}

export function httpEmbeddingsGateway(options: HttpEmbeddingsGatewayOptions): VisionEmbeddingsPort {
  const doFetch = options.fetch ?? fetch;
  const resolve = options.resolve ?? resolveWithDns;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const root = options.baseUrl.replace(/\/+$/, '');

  return {
    model: options.model,
    dimensions: options.dimensions,

    async embed(input: {
      readonly texts: readonly string[];
    }): Promise<ReadonlyArray<readonly number[]>> {
      const texts = input.texts;
      if (texts.length === 0) return [];

      // La misma comprobacion SSRF que el gateway de chat: la direccion puede ser
      // privada (un Ollama local) SOLO si el despliegue lo autoriza expresamente.
      if (!(await isAllowedBaseUrl(root, options.allowPrivateBaseUrls, resolve))) {
        throw new Error('EMBEDDINGS_BASE_URL_NOT_ALLOWED');
      }

      const key = options.apiKey ?? '';
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };
      if (key !== '') headers.authorization = `Bearer ${key}`;

      let res: Response;
      try {
        res = await doFetch(`${root}/v1/embeddings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: options.model, input: texts }),
          redirect: 'manual',
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new Error('EMBEDDINGS_UNREACHABLE');
      }

      if (!res.ok) throw new Error(`EMBEDDINGS_HTTP_${res.status}`);

      const body: unknown = await res.json().catch(() => null);
      const data = arrayAt(body, 'data');
      if (data.length !== texts.length) throw new Error('EMBEDDINGS_BAD_RESPONSE');

      // El orden lo garantiza `index`; se respeta para no emparejar un vector con otro
      // texto. Sin `index`, se cae al orden de llegada.
      const ordered = [...data].sort((a, b) => indexOf(a) - indexOf(b));

      return ordered.map((entry): readonly number[] => {
        const raw = objectAt(entry, 'embedding');
        if (!Array.isArray(raw) || raw.length !== options.dimensions) {
          throw new Error('EMBEDDINGS_DIMENSION_MISMATCH');
        }
        return raw.map((n) => {
          if (typeof n !== 'number' || !Number.isFinite(n)) {
            throw new Error('EMBEDDINGS_BAD_RESPONSE');
          }
          return n;
        });
      });
    },
  };
}

function objectAt(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function arrayAt(value: unknown, key: string): unknown[] {
  const found = objectAt(value, key);
  return Array.isArray(found) ? found : [];
}

function indexOf(entry: unknown): number {
  const found = objectAt(entry, 'index');
  return typeof found === 'number' && Number.isFinite(found) ? found : 0;
}
