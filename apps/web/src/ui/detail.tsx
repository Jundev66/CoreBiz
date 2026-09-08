/**
 * Piezas comunes de las fichas de detalle.
 *
 * Son Server Components y no llevan una linea de JavaScript al navegador. El
 * cambio de estado es un `<form>` que hace POST a una Server Action: se recarga la
 * pagina y ya esta. Un boton con estado de cliente seria mas vistoso y dejaria de
 * funcionar exactamente cuando mas falta hace — en el mostrador de una tienda, con
 * la conexion mala y un movil de hace seis anos.
 */

export interface DetailRow {
  readonly label: string;
  readonly value: string | null;
  /** Para codigos e identificadores: se leen mejor en monoespaciada. */
  readonly mono?: boolean;
}

/**
 * Los datos de la ficha, en una lista de definiciones.
 *
 * `<dl>` y no una tabla: esto son pares etiqueta-valor de UNA entidad, no filas
 * comparables entre si. Un lector de pantalla anuncia la relacion; una tabla de dos
 * columnas le haria leer "columna 1, columna 2" sin decir de que.
 *
 * Los campos vacios se muestran igualmente, con un guion. Ocultarlos haria que la
 * ficha cambiara de forma segun el cliente y obligaria a recordar que campos hay.
 */
export function DetailList({
  rows,
  emptyLabel,
}: {
  rows: readonly DetailRow[];
  emptyLabel: string;
}) {
  return (
    <dl className="grid gap-x-8 gap-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{row.label}</dt>
          <dd
            className={
              row.value === null
                ? 'mt-1 text-[var(--color-muted)]'
                : row.mono === true
                  ? 'mt-1 font-mono text-sm'
                  : 'mt-1'
            }
          >
            {row.value ?? emptyLabel}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * El estado, en palabras y no solo en color.
 *
 * Un punto de color no dice nada a quien no distingue el rojo del verde, y tampoco
 * a quien no sabe cual de los dos significa que.
 */
export function StatusBadge({
  archived,
  activeLabel,
  archivedLabel,
}: {
  archived: boolean;
  activeLabel: string;
  archivedLabel: string;
}) {
  return (
    <span
      className={
        archived
          ? 'rounded-full border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-3 py-1 text-xs font-medium text-[var(--color-warn-ink)]'
          : 'rounded-full border border-[var(--color-line)] px-3 py-1 text-xs font-medium'
      }
    >
      {archived ? archivedLabel : activeLabel}
    </span>
  );
}

/**
 * Archivar o devolver a la lista.
 *
 * NO hay boton de eliminar en ninguna ficha, y la ausencia es la decision. Un
 * cliente con notas emitidas o un producto que aparece en ellas no se pueden borrar
 * sin dejar documentos apuntando al vacio. Archivar hace lo que la gente quiere
 * cuando dice "borralo" —dejar de verlo— y ademas se deshace en un clic.
 */
export function StatusToggle({
  action,
  idField,
  id,
  archived,
  archiveLabel,
  restoreLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  idField: string;
  id: string;
  archived: boolean;
  archiveLabel: string;
  restoreLabel: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name={idField} value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <button
        type="submit"
        className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm transition hover:border-[var(--color-brand)]"
      >
        {archived ? restoreLabel : archiveLabel}
      </button>
    </form>
  );
}
