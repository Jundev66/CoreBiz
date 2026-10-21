import type { VisionBridgePort } from './ports';
import type { VisionActorContext } from './types';

/**
 * Construye el prompt de extracción estructurada.
 *
 * Es un prompt de contrato, no de conversación: pide salida JSON que cumpla el esquema de
 * `documents.ts` y prohíbe inventar. El host puede enriquecerlo con contexto de negocio
 * (su moneda, su catálogo), pero el paquete no depende de ello.
 */
export function buildExtractionPrompt(
  bridge: VisionBridgePort,
  _actor: VisionActorContext,
  options?: { readonly extraInstructions?: string },
): string {
  const extra = options?.extraInstructions?.trim();

  return `Eres un extractor de datos de documentos de recepcion de mercancia (notas de entrega, remisiones, comprobantes internos).

Recibes una FOTO o ESCANEO del documento y devuelves UNICAMENTE un objeto JSON valido, sin texto adicional, sin explicaciones y sin bloques de codigo.

El JSON debe tener exactamente esta forma:
{
  "supplier": "nombre del proveedor que emite",
  "reference": "referencia o numero del documento",
  "issuedAt": "fecha en formato YYYY-MM-DD",
  "currency": "codigo de moneda de 3 letras, por defecto ${bridge.currency}",
  "lines": [
    { "description": "descripcion del articulo tal como aparece", "quantity": 1, "unit": "unidad", "unitCost": 0 }
  ],
  "notes": "observaciones opcionales"
}

Reglas:
- Si un dato no aparece en el documento, NO lo inventes: omitelo o usa el valor que el documento muestre.
- Los numeros van como numeros JSON, no como texto.
- La moneda por defecto es ${bridge.currency} si el documento no la declara.
- Este documento NO es fiscal: no busques ni incluyas numeros de control, sellos ni datos tributarios.${extra ? `\n\nInstrucciones adicionales del ERP:\n${extra}` : ''}`;
}
