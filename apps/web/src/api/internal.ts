import 'server-only';
import { apiBaseUrl } from './client';

/**
 * Llamadas a los endpoints internos de la API.
 *
 * Van aparte del cliente normal porque NO llevan sesion de usuario: se invocan antes
 * de que exista una —el limitador protege el propio acceso— o desde un cron, que no
 * es nadie. La credencial es un secreto compartido entre los dos despliegues.
 *
 * Si el secreto no esta configurado, la API responde 404 a estos endpoints en lugar de
 * abrirse. Aqui se traduce eso a "no disponible", y cada llamante decide: el limitador
 * cae a contar en memoria, y la purga se rinde y lo dice.
 */

/**
 * Why an internal call failed, because callers must treat the two very differently:
 * `misconfigured` (secret missing, or rejected by the API) never fixes itself, while
 * `unreachable` (timeout, a cold start, a 5xx) usually does within a minute.
 */
export type InternalFailureReason = 'misconfigured' | 'unreachable';

export class InternalCallFailed extends Error {
  constructor(
    message: string,
    readonly reason: InternalFailureReason,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export async function callInternal<T>(path: string, body?: unknown): Promise<T> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret === undefined || secret === '') {
    throw new InternalCallFailed('Falta INTERNAL_API_SECRET.', 'misconfigured');
  }

  const res = await fetch(`${apiBaseUrl()}/internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    // Corto a proposito: esto corre en el camino del formulario de acceso, y quien
    // esta intentando entrar no puede esperar a que despierte un servicio dormido.
    signal: AbortSignal.timeout(5_000),
  }).catch((cause: unknown) => {
    throw new InternalCallFailed(`La API no respondio a /internal${path}`, 'unreachable', {
      cause,
    });
  });

  if (!res.ok) {
    // The guard answers 404 when the secret is unset or wrong on the API side: that is a
    // configuration mismatch between the two deployments, not a sleeping service.
    const reason = [401, 403, 404].includes(res.status) ? 'misconfigured' : 'unreachable';
    throw new InternalCallFailed(`/internal${path} respondio ${res.status}`, reason);
  }
  return (await res.json()) as T;
}
