import { Archive, ArchiveRestore } from 'lucide-react';
import { buttonClasses } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { Card } from '@/ui/primitives';

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
    <Card>
      <dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-medium text-muted">{row.label}</dt>
            <dd
              className={
                row.value === null
                  ? 'mt-1 text-[15px] text-muted'
                  : row.mono === true
                    ? 'mt-1 font-mono text-sm break-all text-ink'
                    : 'mt-1 text-[15px] break-words text-ink'
              }
            >
              {row.value ?? emptyLabel}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
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
    <Badge tone={archived ? 'warn' : 'success'}>{archived ? archivedLabel : activeLabel}</Badge>
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
  const Icon = archived ? ArchiveRestore : Archive;

  return (
    <form action={action}>
      <input type="hidden" name={idField} value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {archived ? restoreLabel : archiveLabel}
      </button>
    </form>
  );
}
