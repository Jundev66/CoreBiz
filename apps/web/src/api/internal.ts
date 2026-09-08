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

export class InternalCallFailed extends Error {}

export async function callInternal<T>(path: string, body?: unknown): Promise<T> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret === undefined || secret === '') {
    throw new InternalCallFailed('Falta INTERNAL_API_SECRET.');
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
    throw new InternalCallFailed(`La API no respondio a /internal${path}`, { cause });
  });

  if (!res.ok) throw new InternalCallFailed(`/internal${path} respondio ${res.status}`);
  return (await res.json()) as T;
}
