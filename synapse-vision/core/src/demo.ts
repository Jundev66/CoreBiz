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

export interface DemoSamplePreset {
  readonly id: string;
  readonly filename: string;
  readonly label: string;
  readonly description: string;
  readonly badge: string;
  readonly extraction: VisionExtraction;
}

export const DEMO_PRESETS: readonly DemoSamplePreset[] = [
  {
    id: 'happy-path',
    filename: DEMO_FILENAME,
    label: 'Remito estándar (coincidencia total)',
    description:
      'Proveedor conocido y productos existentes en catálogo. Flujo directo sin discrepancias.',
    badge: 'Sin discrepancias',
    extraction: {
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
      notes: 'Documento estándar de prueba sin discrepancias con el catálogo.',
    },
  },
  {
    id: 'discrepancies',
    filename: 'remito-discrepancias.pdf',
    label: 'Remito con discrepancias (ítems nuevos)',
    description:
      'Proveedor no registrado y artículos fuera de catálogo para confirmar su alta o mapeo.',
    badge: 'Requiere revisión',
    extraction: {
      supplier: 'Lácteos y Alimentos Los Andes, C.A.',
      reference: 'FAC-8841',
      issuedAt: '2026-10-20',
      currency: 'USD',
      lines: [
        { description: 'Harina de trigo 1 kg', quantity: 15, unit: 'bolsa', unitCost: 1.25 },
        { description: 'Queso Gouda rebanado 500 g', quantity: 8, unit: 'paquete', unitCost: 4.8 },
        {
          description: 'Crema de leche pasteurizada 250 ml',
          quantity: 12,
          unit: 'envase',
          unitCost: 1.9,
        },
        { description: 'Azucar refinada 1 kg', quantity: 10, unit: 'paquete', unitCost: 0.95 },
      ],
      notes: 'Comprobante con proveedor e ítems no existentes en el inventario actual.',
    },
  },
  {
    id: 'wrinkled-ticket',
    filename: 'ticket-compra-arrugado.pdf',
    label: 'Ticket de compra de mostrador',
    description: 'Comprobante de caja con formato compacto, ítems fraccionados y proveedor local.',
    badge: 'Ticket impreso',
    extraction: {
      supplier: 'Supermercado Mayorista El Rincón, S.A.',
      reference: 'TK-3091',
      issuedAt: '2026-10-22',
      currency: 'USD',
      lines: [
        { description: 'Cafe molido 250 g', quantity: 6, unit: 'paquete', unitCost: 2.2 },
        {
          description: 'Levadura seca instantánea 100 g',
          quantity: 25,
          unit: 'sobre',
          unitCost: 0.65,
        },
        {
          description: 'Aceite vegetal comestible 1 L',
          quantity: 10,
          unit: 'botella',
          unitCost: 2.8,
        },
      ],
      notes: 'Ticket de compras directas de mostrador.',
    },
  },
];

export function isDemoFilename(filename: string | null | undefined): boolean {
  if (!filename) return false;
  return filename === DEMO_FILENAME || DEMO_PRESETS.some((p) => p.filename === filename);
}

export function demoExtractionFor(filename?: string | null): VisionExtraction {
  if (filename) {
    const preset = DEMO_PRESETS.find((p) => p.filename === filename);
    if (preset) return preset.extraction;
  }
  return demoExtraction();
}

export function demoExtraction(): VisionExtraction {
  return DEMO_PRESETS[0]!.extraction;
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
export function demoDocument(filename?: string | null): VisionDocument {
  const ext = demoExtractionFor(filename);
  const name = filename && isDemoFilename(filename) ? filename : DEMO_FILENAME;
  return pdfDocument(name, demoDocumentLines(ext));
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
export function demoDocumentBase64(filename?: string | null): string {
  return uint8ArrayToBase64(demoDocument(filename).bytes);
}
