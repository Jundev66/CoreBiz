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
 * Neutraliza los comodines de un termino de busqueda.
 *
 * `%`, `_` y `\` significan algo dentro de un LIKE. Sin escaparlos, buscar "100%"
 * devuelve cualquier cosa que empiece por "100", y un termino de solo "%" o "_" trae la
 * tabla entera — que es justo lo que hace quien escribe un caracter suelto en la caja de
 * busqueda.
 *
 * HACE FALTA TAMBIEN CON PRISMA, y darlo por hecho costo una comprobacion en falso.
 * `contains` NO escapa nada: compone `like '%' || $1 || '%'` y pasa el termino como
 * parametro, asi que los comodines que lleve dentro siguen siendo comodines. Medido
 * contra la base: con nueve clientes, buscar "%" devolvia los nueve.
 *
 * El escape funciona porque la barra invertida es el caracter de escape por defecto de
 * LIKE en Postgres, y eso vale igual dentro de un parametro que dentro de un literal.
 */
export function escapeLikeWildcards(search: string): string {
  return search.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** El termino ya escapado y envuelto en comodines, para un LIKE escrito a mano. */
export function likePattern(search: string): string {
  return `%${escapeLikeWildcards(search)}%`;
}
