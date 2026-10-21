import type { VisionDocument } from './types';
import type { VisionExtraction } from './documents';
import { pdfDocument } from './demo-pdf';

/**
 * El modo demo: lo que se muestra cuando el host NO tiene una IA configurada.
 *
 * No es un placeholder vacío — es la capacidad funcionando de punta a punta con datos de
 * ejemplo: un documento descargable, un escaneo simulado y una extracción que cumple el
 * mismo contrato que produciría el modelo real. Es lo que permite que una instalación de
 * producción sin proveedor enseñe la función en lugar de un error.
 */

export const DEMO_FILENAME = 'nota-de-entrega-ejemplo.pdf';

export function demoExtraction(): VisionExtraction {
  return {
    supplier: 'Distribuidora Central, C.A.',
    reference: 'NE-4502',
    issuedAt: '2026-10-14',
    currency: 'USD',
    lines: [
      { description: 'Harina de trigo 1 kg', quantity: 20, unit: 'bolsa', unitCost: 1.2 },
      { description: 'Manteca vegetal 500 g', quantity: 5, unit: 'pote', unitCost: 3.5 },
      { description: 'Azucar refinada 1 kg', quantity: 12, unit: 'paquete', unitCost: 0.95 },
      { description: 'Cafe molido 250 g', quantity: 8, unit: 'paquete', unitCost: 2.1 },
    ],
    notes: 'Documento de ejemplo generado por Synapse Vision para la demostracion.',
  };
}

/**
 * Las líneas del documento de ejemplo, derivadas de la propia extracción para que ambos
 * coincidan: lo que se ve en el PDF es exactamente lo que el modo demo "extrae".
 * Texto en ASCII a propósito (el generador de PDF no maneja acentos).
 */
export function demoDocumentLines(
  extraction: VisionExtraction = demoExtraction(),
): readonly string[] {
  const header = [
    'DOCUMENTO DE RECEPCION DE MERCANCIA',
    '(documento de ejemplo, sin valor fiscal)',
    '',
    `Proveedor: ${extraction.supplier}`,
    `Referencia: ${extraction.reference}`,
    `Fecha: ${extraction.issuedAt}`,
    `Moneda: ${extraction.currency}`,
    '',
    'Articulo                          Cant.   Unidad     Costo',
    '--------------------------------------------------------------',
  ];

  const rows = extraction.lines.map((line) => {
    const description = line.description.slice(0, 32).padEnd(32, ' ');
    const quantity = String(line.quantity).padStart(5, ' ');
    const unit = line.unit.slice(0, 9).padEnd(9, ' ');
    const cost = line.unitCost.toFixed(2).padStart(8, ' ');
    return `${description}${quantity}   ${unit}${cost}`;
  });

  return [...header, ...rows, '', 'Fin del documento de ejemplo.'];
}

/** El documento de ejemplo listo para descargar o servir desde el host. */
export function demoDocument(): VisionDocument {
  return pdfDocument(DEMO_FILENAME, demoDocumentLines());
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < len ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < len ? (bytes[i + 2] ?? 0) : 0;

    result += B64_CHARS[b0 >> 2] ?? '';
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)] ?? '';
    result += i + 1 < len ? (B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] ?? '=') : '=';
    result += i + 2 < len ? (B64_CHARS[b2 & 63] ?? '=') : '=';
  }
  return result;
}

/**
 * La representación en base64 del documento de ejemplo, utilizable directamente en la UI
 * como documento pre-cargado por defecto para la demostración.
 */
export function demoDocumentBase64(): string {
  return uint8ArrayToBase64(demoDocument().bytes);
}
