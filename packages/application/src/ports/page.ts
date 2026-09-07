/**
 * Una pagina de resultados.
 *
 * Vive en su propio modulo y no dentro de `repositories.ts` por una razon
 * concreta: `repositories.ts` importa los puertos de compras, y estos necesitan
 * `Page`. Con el tipo alli dentro, los dos modulos se importan mutuamente y
 * `pnpm arch` rompe el build — con razon, porque un ciclo entre modulos de
 * puertos significa que la frontera no esta donde se creia.
 *
 * Sacarlo aparte ademas lo describe mejor: paginar no es una idea de los
 * repositorios, es una forma de devolver resultados que usan tambien los modelos
 * de lectura.
 */
export interface Page<T> {
  readonly items: readonly T[];
  /** Cursor de la siguiente pagina, o null si no hay mas. Paginacion por keyset. */
  readonly nextCursor: string | null;
}
