'use client';

import { useState, useTransition } from 'react';
import { BotMessageSquare, Sparkles, Check, X } from 'lucide-react';
import { simulateDemoValidationAction } from '@/actions/demo';

const DEMO_VALIDATIONS = [
  {
    kind: 'EmailAlreadyRegistered',
    label: '✉️ Correo ya existente',
    hint: 'Simula el intento de registrar o invitar un correo duplicado',
  },
  {
    kind: 'InsufficientStock',
    label: '📦 Stock insuficiente',
    hint: 'Simula despachar más existencias de las disponibles en almacén',
  },
  {
    kind: 'CreditLimitExceeded',
    label: '💳 Límite de crédito',
    hint: 'Simula exceder el cupo máximo de crédito autorizado para un cliente',
  },
  {
    kind: 'DuplicateSku',
    label: '🏷️ SKU duplicado',
    hint: 'Simula intentar registrar un producto con un código SKU que ya existe',
  },
  {
    kind: 'NoExchangeRate',
    label: '💱 Sin tasa de cambio',
    hint: 'Simula emitir una venta multimoneda sin tasa del día configurada',
  },
  {
    kind: 'Forbidden',
    label: '🔒 Permiso denegado',
    hint: 'Simula una acción restringida no autorizada para el rol activo',
  },
  {
    kind: 'Unexpected',
    label: '⚠️ Error 500 (Incidente)',
    hint: 'Simula una excepción técnica protegida con código de soporte INC-XXXX',
  },
] as const;

export function DemoValidationSimulator() {
  const [pending, startTransition] = useTransition();
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const handleSimulate = (kind: string) => {
    startTransition(async () => {
      setSelectedKind(kind === 'clear' ? null : kind);
      await simulateDemoValidationAction(kind);
    });
  };

  if (minimized) {
    return (
      <div className="fixed bottom-20 left-4 z-40 print:hidden">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-1.5 rounded-pill border border-brand bg-surface px-3 py-1.5 text-xs font-semibold text-brand shadow-lg transition hover:bg-brand-soft"
        >
          <Sparkles className="size-3.5 text-brand" />
          <span>Simulador de Validaciones</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Simulador de Validaciones de Demostración"
      className="mx-auto my-3 w-full max-w-6xl px-4 sm:px-6 lg:px-10"
    >
      <div className="relative rounded-card border border-brand-line bg-surface/95 p-3.5 shadow-sm backdrop-blur-xs transition">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-pill bg-brand-soft text-brand">
              <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-ink uppercase">
                Modo Demo · Simulador de Validaciones para Synapse
              </h3>
              <p className="text-[11px] text-muted">
                Haz clic en una validación para ver cómo el asistente la detecta, explica por qué
                ocurrió y guía al usuario:
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedKind && (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleSimulate('clear')}
                className="inline-flex items-center gap-1 rounded-pill border border-line bg-subtle px-2 py-0.5 text-[11px] font-medium text-muted hover:text-ink disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-3" />
                <span>Limpiar error</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMinimized(true)}
              aria-label="Minimizar simulador"
              className="rounded-control p-1 text-muted hover:bg-subtle hover:text-ink"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Chips de validaciones interactivas */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {DEMO_VALIDATIONS.map((item) => {
            const isSelected = selectedKind === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                disabled={pending}
                title={item.hint}
                onClick={() => handleSimulate(item.kind)}
                className={`inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? 'border border-brand bg-brand text-white shadow-xs'
                    : 'border border-line bg-surface text-ink hover:border-brand-line hover:bg-brand-soft/30'
                }`}
              >
                {isSelected && <Check aria-hidden="true" className="size-3 stroke-2" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {selectedKind && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-control border border-brand/30 bg-brand-soft/20 px-3 py-1.5 text-xs text-ink">
            <span className="flex items-center gap-1.5">
              <BotMessageSquare className="size-3.5 text-brand" />
              <span>
                Validación activa: <strong>{selectedKind}</strong>. Abre el botón del Asistente
                (abajo a la derecha) para ver la explicación completa.
              </span>
            </span>
            <span className="text-[10px] font-semibold text-brand animate-pulse">
              ● Notificación activa en el Asistente
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
