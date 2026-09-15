'use client';

import { Printer } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

/**
 * Abre el dialogo de impresion del navegador.
 *
 * Es el unico JavaScript de la pantalla de impresion, y solo mejora: sin el, el
 * documento sigue siendo imprimible con Ctrl+P. El texto de ayuda dice como
 * guardarlo en PDF porque no todo el mundo sabe que el destino "Guardar como
 * PDF" esta dentro del dialogo de imprimir — es exactamente el tipo de cosa que
 * un sistema para gente no experta tiene que decir en voz alta.
 */
export function PrintButton({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="text-right">
      <button type="button" onClick={() => window.print()} className={buttonClasses()}>
        <Printer aria-hidden="true" className="size-4" strokeWidth={2} />
        {label}
      </button>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
}
