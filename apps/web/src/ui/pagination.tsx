import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  readonly nextCursor?: string | null | undefined;
  readonly currentCursor?: string | null | undefined;
  readonly basePath: string;
  readonly params?: Readonly<Record<string, string | undefined>> | undefined;
  readonly itemCount?: number | undefined;
  readonly pageSize?: number | undefined;
  readonly nextLabel?: string | undefined;
  readonly firstPageLabel?: string | undefined;
}

/**
 * Componente de paginación universal para listados de CoreBiz.
 *
 * Muestra el selector de registros por página, contador de filas visibles
 * y botones accesibles de navegación Anterior / Siguiente.
 */
export function Pagination({
  nextCursor,
  currentCursor,
  basePath,
  params = {},
  itemCount,
  pageSize = 10,
  nextLabel = 'Siguiente',
  firstPageLabel = 'Anterior',
}: PaginationProps) {
  // Si no hay registros en absoluto (tabla vacía), no mostrar paginación
  if (itemCount === 0) {
    return null;
  }

  const buildUrl = (targetCursor?: string | null, targetLimit?: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '' && key !== 'cursor' && key !== 'limite') {
        sp.set(key, value);
      }
    }
    const effLimit = targetLimit ?? pageSize;
    if (effLimit && effLimit !== 10) {
      sp.set('limite', String(effLimit));
    }
    if (targetCursor) {
      sp.set('cursor', targetCursor);
    }
    const query = sp.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const hasNext = Boolean(nextCursor);
  const hasPrev = Boolean(currentCursor);

  return (
    <nav
      aria-label="Paginación de registros"
      className="mt-4 flex flex-col gap-3 rounded-control border border-line bg-surface/80 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between text-xs text-ink"
    >
      {/* Selector de registros por página */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted font-medium">Mostrar:</span>
        <div className="flex items-center gap-1">
          {[5, 10, 25, 50].map((size) => {
            const isSelected = size === pageSize;
            return isSelected ? (
              <span
                key={size}
                className="rounded-control bg-brand px-2.5 py-1 font-semibold text-brand-ink shadow-xs"
              >
                {size}
              </span>
            ) : (
              <Link
                key={size}
                href={buildUrl(null, size)}
                className="rounded-control border border-line bg-subtle/60 px-2.5 py-1 font-medium text-ink transition hover:border-[var(--color-brand)] hover:bg-subtle"
                title={`Mostrar ${size} registros`}
              >
                {size}
              </Link>
            );
          })}
        </div>
        {itemCount !== undefined && (
          <span className="text-muted ml-1">
            · <strong className="font-medium text-ink">{itemCount}</strong> en esta vista
          </span>
        )}
      </div>

      {/* Navegación y estado de página */}
      <div className="flex items-center justify-between sm:justify-end gap-3">
        <span className="text-muted font-medium">
          {hasPrev ? 'Página 2 o posterior' : 'Página 1'}
        </span>

        <div className="flex items-center gap-1.5">
          {hasPrev ? (
            <Link
              href={buildUrl(null)}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-[var(--color-brand)] hover:bg-subtle"
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
              <span>{firstPageLabel}</span>
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-control border border-line/40 bg-subtle/30 px-2.5 py-1 text-muted/60 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" strokeWidth={2} />
              <span>{firstPageLabel}</span>
            </span>
          )}

          {hasNext ? (
            <Link
              href={buildUrl(nextCursor)}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-[var(--color-brand)] hover:bg-subtle"
            >
              <span>{nextLabel}</span>
              <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-control border border-line/40 bg-subtle/30 px-2.5 py-1 text-muted/60 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              <span>{nextLabel}</span>
              <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
