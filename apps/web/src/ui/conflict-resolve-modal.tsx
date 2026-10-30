'use client';

import { useActionState, useEffect, useState } from 'react';
import { resolveConflictAction } from '@/actions/pos';
import type { ActionState } from '@/actions/customers';
import { toast } from '@/ui/toast';
import { CheckCircle2, X } from 'lucide-react';

const INITIAL_STATE: ActionState = { status: 'idle' };

export interface ConflictViewItem {
  readonly id: string;
  readonly productId: string;
  readonly conflictType: string;
  readonly status: string;
  readonly detectedAt: string;
  readonly stockBefore: string;
  readonly quantityAttempted: string;
  readonly stockAfter: string;
  readonly shortageQuantity: string;
  readonly assignedTo: string | null;
  readonly resolutionType: string | null;
  readonly resolutionNotes: string | null;
}

interface ConflictResolveModalProps {
  readonly conflict: ConflictViewItem;
}

export function ConflictResolveModal({ conflict }: ConflictResolveModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(resolveConflictAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status === 'success') {
      toast.success('Inconsistencia resuelta con éxito');
      setIsOpen(false);
    } else if (state.status === 'error' && state.errorKind) {
      toast.error(`Error al resolver: ${state.errorKind}`);
    }
  }, [state]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
      >
        <CheckCircle2 className="size-3.5" />
        Resolver
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-card border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div>
            <h3 className="text-base font-semibold text-ink">
              Resolver Inconsistencia de Inventario
            </h3>
            <p className="text-xs text-muted font-mono mt-0.5">{conflict.id}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1 text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="my-4 rounded-lg bg-warn-soft/60 border border-warn/30 p-3 text-xs text-warn-ink space-y-1">
          <p>
            <strong>Déficit detectado:</strong> {conflict.shortageQuantity} unidades
          </p>
          <p>
            <strong>Stock tras sobreventa:</strong> {conflict.stockAfter} (Anterior:{' '}
            {conflict.stockBefore})
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="conflictId" value={conflict.id} />

          <div>
            <label htmlFor="resolutionType" className="block text-xs font-semibold text-ink mb-1">
              Método de Conciliación
            </label>
            <select
              id="resolutionType"
              name="resolutionType"
              required
              defaultValue="adjustment_in"
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            >
              <option value="adjustment_in">
                Ajuste positivo de inventario (ingreso de mercadería no registrada)
              </option>
              <option value="catalog_created">
                Alta en catálogo ERP (para venta contingente de ítem no catalogado)
              </option>
              <option value="linked_existing">Vinculación a producto existente</option>
              <option value="dismissed_known">Desestimar / Asumir merma regularizada</option>
            </select>
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-ink mb-1">
              Notas y Justificación de Conciliación
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Detalla el motivo del faltante, remisión o conteo en estante..."
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsOpen(false)}
              className="rounded-control border border-line px-4 py-2 text-xs font-medium text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand/90 disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : 'Confirmar Resolución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
