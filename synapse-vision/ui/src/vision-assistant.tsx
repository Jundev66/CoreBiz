import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactElement,
} from 'react';
import type { VisionExtractResponse } from '@synapse-vision/core';
import { useVision, type VisionFileInput } from './use-vision';
import type { VisionTransport } from './transport';

/** El valor ASCII de una imagen subida, ya como base64 sin el prefijo `data:`. */
interface Preview extends VisionFileInput {
  readonly mimeType: string;
}

export interface VisionAssistantProps {
  /** La implementación del host. La vista no conoce endpoints ni sesiones. */
  readonly transport: VisionTransport;
  readonly title?: string;
  readonly className?: string;
  readonly accept?: string;
}

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_BASE64_UPLOAD = 4_500_000;

function readFileAsBase64(file: File): Promise<VisionFileInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve({
        base64: comma >= 0 ? result.slice(comma + 1) : result,
        mimeType: file.type,
        filename: file.name,
      });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function resizeImageIfLarge(
  file: File,
  maxDimension = 1800,
  quality = 0.85,
): Promise<VisionFileInput | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (width <= maxDimension && height <= maxDimension && file.size < 2.5 * 1024 * 1024) {
        return resolve(null);
      }
      const ratio = Math.min(maxDimension / width, maxDimension / height, 1);
      const targetW = Math.round(width * ratio);
      const targetH = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const comma = dataUrl.indexOf(',');
      resolve({
        base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        mimeType,
        filename: file.name,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function processFileForUpload(file: File): Promise<VisionFileInput> {
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    file.type.startsWith('image/')
  ) {
    try {
      const optimized = await resizeImageIfLarge(file);
      if (optimized !== null) return optimized;
    } catch {
      // Fallback a lectura normal si falla canvas
    }
  }
  return readFileAsBase64(file);
}

function dataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * La vista de Synapse Vision. Pinta el modo demo exactamente igual que el modo modelo: si el
 * host no tiene IA, llega `mode: 'demo'` y se muestra el documento de ejemplo y su
 * extracción. En ningún caso se enseña un error por "no hay IA".
 */
export function VisionAssistant({
  transport,
  title = 'Leer documento de recepción',
  className,
  accept = DEFAULT_ACCEPT,
}: VisionAssistantProps): ReactElement {
  const { state, scan, reset } = useVision(transport);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelect = useCallback(async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setClientError(null);
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      const input = await processFileForUpload(file);
      if (input.base64.length > MAX_BASE64_UPLOAD) {
        setClientError('El archivo seleccionado supera el límite de subida (~3.5 MB).');
        setPreview(null);
        return;
      }
      setPreview({ ...input, mimeType: input.mimeType });
    } catch {
      setClientError('No se pudo procesar el archivo seleccionado.');
      setPreview(null);
    }
  }, []);

  const onScan = useCallback((): void => {
    if (preview === null) return;
    void scan(preview);
  }, [preview, scan]);

  const onReset = useCallback((): void => {
    setClientError(null);
    setPreview(null);
    if (inputRef.current !== null) inputRef.current.value = '';
    reset();
  }, [reset]);

  return (
    <section
      className={className}
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        display: 'grid',
        gap: 16,
        maxWidth: 720,
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
        {state.status === 'ready' && <ModeBadge mode={state.result.mode} />}
      </header>

      {/* Selector de archivo y acciones principales con wrap y botones estilizados */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#f8fafc',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#334155',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span>📁 Seleccionar archivo</span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(event) => {
              void onSelect(event);
            }}
            aria-label="Imagen del documento"
            style={{ display: 'none' }}
          />
        </label>

        {preview !== null ? (
          <span
            style={{
              fontSize: 13,
              color: '#0f172a',
              fontWeight: 500,
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={preview.filename}
          >
            {preview.filename}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: '#64748b' }}>Ningún archivo seleccionado</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onScan}
            disabled={preview === null || state.status === 'scanning'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '7px 16px',
              backgroundColor: preview === null ? '#94a3b8' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: preview === null || state.status === 'scanning' ? 'not-allowed' : 'pointer',
              opacity: state.status === 'scanning' ? 0.7 : 1,
              transition: 'background-color 0.15s ease',
            }}
          >
            {state.status === 'scanning' ? 'Leyendo documento…' : 'Leer documento'}
          </button>

          {(preview !== null || state.status !== 'idle') && (
            <button
              type="button"
              onClick={onReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '7px 14px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Reiniciar
            </button>
          )}
        </div>
      </div>

      {preview !== null && preview.mimeType.startsWith('image/') && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
          <img
            src={dataUrl(preview.mimeType, preview.base64)}
            alt="Documento seleccionado"
            style={{
              maxHeight: 180,
              maxWidth: '100%',
              objectFit: 'contain',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          />
        </div>
      )}

      {(clientError !== null || state.status === 'error') && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            margin: 0,
          }}
        >
          {clientError ?? (state.status === 'error' ? state.message : null)}
        </div>
      )}

      {state.status === 'ready' && <ExtractionView result={state.result} />}
    </section>
  );
}

function ModeBadge({ mode }: { readonly mode: VisionExtractResponse['mode'] }): ReactElement {
  const isDemo = mode === 'demo';
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        background: isDemo ? '#fef3c7' : '#ecfdf5',
        color: isDemo ? '#92400e' : '#065f46',
        border: `1px solid ${isDemo ? '#fde68a' : '#a7f3d0'}`,
      }}
    >
      {isDemo ? 'Demostración' : 'Modelo de IA'}
    </span>
  );
}

function ExtractionView({ result }: { readonly result: VisionExtractResponse }): ReactElement {
  const { extraction, matches, document } = result;
  const thCell: CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontWeight: 600,
    fontSize: 12,
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const tdCell: CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    textAlign: 'left',
    color: '#0f172a',
    fontSize: 13,
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 12,
          backgroundColor: '#f8fafc',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <span
            style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}
          >
            Proveedor
          </span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
            {extraction.supplier || '—'}
          </div>
        </div>
        <div>
          <span
            style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}
          >
            Referencia
          </span>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              marginTop: 2,
              fontFamily: 'monospace',
            }}
          >
            {extraction.reference || '—'}
          </div>
        </div>
        <div>
          <span
            style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}
          >
            Fecha
          </span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
            {extraction.issuedAt || '—'}
          </div>
        </div>
        <div>
          <span
            style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}
          >
            Moneda
          </span>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              marginTop: 2,
              fontFamily: 'monospace',
            }}
          >
            {extraction.currency || 'USD'}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={thCell}>Descripción</th>
              <th style={{ ...thCell, textAlign: 'right' }}>Cant.</th>
              <th style={thCell}>Unidad</th>
              <th style={{ ...thCell, textAlign: 'right' }}>Costo</th>
              <th style={thCell}>Cotejo Catálogo</th>
            </tr>
          </thead>
          <tbody>
            {extraction.lines.map((line, index) => {
              const match = matches[index]?.[0];
              return (
                <tr key={`${line.description}-${index}`} style={{ backgroundColor: '#ffffff' }}>
                  <td style={{ ...tdCell, fontWeight: 500 }}>{line.description}</td>
                  <td style={{ ...tdCell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {line.quantity}
                  </td>
                  <td style={{ ...tdCell, color: '#64748b' }}>{line.unit}</td>
                  <td
                    style={{
                      ...tdCell,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'monospace',
                    }}
                  >
                    {line.unitCost.toFixed(2)}
                  </td>
                  <td style={tdCell}>
                    {match !== undefined ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontWeight: 500,
                        }}
                      >
                        ✓ {match.name} ({match.sku})
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                        Sin coincidencia
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {document !== undefined && (
        <a
          href={dataUrl(document.mimeType, document.base64)}
          download={document.filename}
          style={{
            fontSize: 13,
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ⬇ Descargar documento de ejemplo ({document.filename})
        </a>
      )}

      {result.mode === 'demo' && (
        <p style={{ margin: 0, fontSize: 12, color: '#b45309' }}>
          No hay un proveedor de IA configurado: estos datos son un ejemplo para mostrar la
          capacidad.
        </p>
      )}
    </div>
  );
}
