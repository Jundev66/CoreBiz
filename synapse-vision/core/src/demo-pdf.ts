import type { VisionDocument } from './types';

/**
 * Generador de PDF mínimo, sin dependencias y determinista.
 *
 * Existe para que el modo demo pueda ofrecer un documento REAL que descargar y "escanear",
 * sin arrastrar una librería de PDF ni un asset binario al paquete. Escribe PDF 1.4 en
 * ASCII puro (sin acentos), de modo que el `length` de la cadena JavaScript coincide byte
 * a byte con el del archivo y la tabla `xref` puede calcularse por longitud.
 *
 * No pretende ser un generador general: una página, una fuente (Helvetica), líneas de
 * texto. Suficiente para un comprobante de ejemplo y verificable en los tests.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 50;
const START_Y = 800;
const LEADING = 15;

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Byte length of an ASCII string: one byte per char, which is why ASCII is required. */
function asciiLength(text: string): number {
  return text.length;
}

export function buildSimplePdf(lines: readonly string[]): Uint8Array {
  const content = ['q', 'BT', '/F1 11 Tf', `${LEADING} TL`, `${MARGIN_X} ${START_Y} Td`]
    .concat(
      lines.map((line, index) =>
        index === 0 ? `(${escapePdfText(line)}) Tj` : `T* (${escapePdfText(line)}) Tj`,
      ),
    )
    .concat(['ET', 'Q'])
    .join('\n');

  const objects: readonly string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${asciiLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(asciiLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = asciiLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return asciiBytes(pdf);
}

/**
 * Bytes de una cadena ASCII, sin `TextEncoder`.
 *
 * `TextEncoder` no existe ni en el `lib` por defecto de TypeScript ni en un runtime sin DOM
 * ni Node —y este paquete tiene que compilar en todos—, así que se codifica a mano. Es
 * correcto precisamente porque el contenido es ASCII puro (regla de arriba).
 */
function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

export function pdfDocument(filename: string, lines: readonly string[]): VisionDocument {
  return {
    filename,
    mimeType: 'application/pdf',
    bytes: buildSimplePdf(lines),
  };
}
