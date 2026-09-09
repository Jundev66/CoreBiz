/**
 * Utilidades de paginacion y busqueda.
 *
 * El cursor es OPACO para quien lo consume: el puerto lo declara como `string` y
 * ni la interfaz ni los casos de uso miran dentro. Eso permite que el adaptador
 * en memoria use un desplazamiento y este use keyset, sin que nadie mas se entere.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

/**
 * Acota el tamano de pagina.
 *
 * El tope no es decoracion: sin el, un parametro de consulta manipulado puede
 * pedir un millon de filas y convertir un listado en una denegacion de servicio
 * contra el plan gratuito, que es justo lo que este proyecto tiene que evitar.
 */
export function pageLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT);
}

export interface Cursor {
  readonly sort: string;
  readonly id: string;
}

export function encodeCursor(sort: string, id: string): string {
  return Buffer.from(JSON.stringify({ sort, id }), 'utf8').toString('base64url');
}

/**
 * Un cursor corrupto se trata como si no hubiera cursor.
 *
 * Llega desde una URL, asi que puede venir manipulado. Empezar por el principio
 * es un resultado correcto y aburrido; lanzar una excepcion convertiria un enlace
 * mal copiado en una pantalla de error.
 */
export function decodeCursor(raw: string | undefined): Cursor | null {
  if (raw === undefined || raw === '') return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { sort, id } = parsed as Record<string, unknown>;
    if (typeof sort !== 'string' || typeof id !== 'string') return null;

    return { sort, id };
  } catch {
    return null;
  }
}

/**
 * Prepara un termino de busqueda para un LIKE.
 *
 * Escapa `%`, `_` y `\`, que son comodines. Sin esto, buscar "100%" devolveria
 * cualquier cosa que empiece por "100", y un termino de solo "%" recorreria la
 * tabla entera.
 */
export function likePattern(search: string): string {
  const escaped = search.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}
