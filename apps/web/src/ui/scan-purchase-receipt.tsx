'use client';

import {
  useCallback,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Layers,
  RefreshCw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  demoDocumentBase64,
  DEMO_FILENAME,
  DEMO_PRESETS,
  type VisionExtractResponse,
} from '@synapse-vision/core';
import {
  createFetchVisionTransport,
  VisionTransportError,
  type VisionFileInput,
} from '@synapse-vision/ui';
import type { AssistantStatusView } from '@/api/ai';
import { buttonClasses } from '@/ui/button';
import {
  confirmVisionPurchaseReceiptAction,
  type ConfirmVisionReceiptActionResult,
} from '@/actions/vision';
import type { ConfirmVisionReceiptBody } from '@corebiz/contracts';

export const SCANNED_PURCHASE_RECEIPT_KEY = 'corebiz_scanned_purchase_receipt';

const transport = createFetchVisionTransport({ endpoint: '/api/vision/extract' });
const MAX_FILE_SIZE_BYTES = 3.5 * 1024 * 1024;

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function resolveMimeType(file: File): string | null {
  if (['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}

function generateAutoSku(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return `ART-${Math.floor(1000 + Math.random() * 9000)}`;
  const prefix = words
    .slice(0, 3)
    .map((w) => w.slice(0, 3))
    .join('');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${suffix}`;
}

export interface SupplierSummaryOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ProductSummaryOption {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly cost: string | null;
}

export interface ScanPurchaseReceiptProps {
  readonly aiStatus?: AssistantStatusView | null | undefined;
  readonly suppliers?: readonly SupplierSummaryOption[] | undefined;
  readonly products?: readonly ProductSummaryOption[] | undefined;
}

interface QueueDocument {
  readonly id: string;
  readonly file: VisionFileInput;
  readonly isCustom: boolean;
  status: 'pending' | 'scanning' | 'ready' | 'confirmed' | 'error';
  result?: VisionExtractResponse | undefined;
  error?: string | undefined;
  errorKind?: string | undefined;
  confirmedReceipt?: ConfirmVisionReceiptActionResult | undefined;
}

interface EditableSupplierDecision {
  mode: 'existing' | 'create';
  supplierId: string;
  name: string;
  taxId: string;
}

interface EditableLineDecision {
  included: boolean;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  mode: 'existing' | 'create';
  productId: string;
  createName: string;
  createSku: string;
  createUnit: string;
}

export function ScanPurchaseReceipt({
  aiStatus,
  suppliers = [],
  products = [],
}: ScanPurchaseReceiptProps): ReactElement {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cola de documentos para procesamiento por lote
  const [documents, setDocuments] = useState<readonly QueueDocument[]>(() => [
    {
      id: 'demo-doc-1',
      file: {
        base64: demoDocumentBase64(),
        mimeType: 'application/pdf',
        filename: DEMO_FILENAME,
      },
      isCustom: false,
      status: 'pending',
    },
  ]);

  const [activeDocId, setActiveDocId] = useState<string>('demo-doc-1');
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'demo' | 'custom'>('demo');

  // Estado del formulario interactivo de revisión del documento activo
  const [supplierDecision, setSupplierDecision] = useState<EditableSupplierDecision>({
    mode: 'create',
    supplierId: suppliers[0]?.id ?? '',
    name: '',
    taxId: '',
  });

  const [linesDecision, setLinesDecision] = useState<readonly EditableLineDecision[]>([]);
  const [supplierReference, setSupplierReference] = useState<string>('');
  const [receiptNotes, setReceiptNotes] = useState<string>('');
  const [isConfirming, startConfirming] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const activeDoc = documents.find((d) => d.id === activeDocId) ?? documents[0];

  // Helper para inicializar las decisiones de revisión cuando un documento pasa a 'ready'
  const initReviewState = useCallback(
    (res: VisionExtractResponse) => {
      const ext = res.extraction;
      setSupplierReference(ext.reference ? String(ext.reference) : '');
      setReceiptNotes(ext.notes ?? '');

      // Resolver proveedor: intentar cotejar con proveedores existentes
      let matchedSupplier: SupplierSummaryOption | undefined;
      if (ext.supplier) {
        const extLower = ext.supplier.toLowerCase().trim();
        matchedSupplier = suppliers.find((s) => {
          const nameLower = s.name.toLowerCase();
          const codeLower = s.code.toLowerCase();
          return (
            nameLower.includes(extLower) || extLower.includes(nameLower) || codeLower === extLower
          );
        });
      }

      if (matchedSupplier) {
        setSupplierDecision({
          mode: 'existing',
          supplierId: matchedSupplier.id,
          name: ext.supplier || matchedSupplier.name,
          taxId: '',
        });
      } else {
        setSupplierDecision({
          mode: suppliers.length > 0 && !ext.supplier ? 'existing' : 'create',
          supplierId: suppliers[0]?.id ?? '',
          name: ext.supplier || 'Nuevo Proveedor',
          taxId: '',
        });
      }

      // Resolver líneas y cotejo de catálogo
      const lines: EditableLineDecision[] = ext.lines.map((line, idx) => {
        const matches = res.matches[idx];
        const bestMatch = matches && matches.length > 0 ? matches[0] : undefined;

        if (bestMatch) {
          return {
            included: true,
            description: line.description,
            quantity: String(line.quantity),
            unit: line.unit,
            unitCost: line.unitCost.toFixed(2),
            mode: 'existing',
            productId: bestMatch.productId,
            createName: line.description,
            createSku: generateAutoSku(line.description),
            createUnit: line.unit || 'und',
          };
        }

        // Si no cotejó con ningún producto del catálogo, sugerir crear en catálogo
        return {
          included: true,
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          unitCost: line.unitCost.toFixed(2),
          mode: 'create',
          productId: products[0]?.id ?? '',
          createName: line.description,
          createSku: generateAutoSku(line.description),
          createUnit: line.unit || 'und',
        };
      });

      setLinesDecision(lines);
    },
    [suppliers, products],
  );

  // Escanear un documento individual
  const scanDocument = useCallback(
    async (docId: string): Promise<void> => {
      setConfirmError(null);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: 'scanning', error: undefined } : d)),
      );

      const target = documents.find((d) => d.id === docId);
      if (!target) return;

      try {
        const res = await transport.extract({
          imageBase64: target.file.base64,
          mimeType: target.file.mimeType,
          filename: target.file.filename,
        });
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, status: 'ready', result: res, error: undefined, errorKind: undefined }
              : d,
          ),
        );
        if (docId === activeDocId) {
          initReviewState(res);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error al procesar';
        const errorKind = err instanceof VisionTransportError ? err.errorKind : undefined;
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  status: 'error',
                  error: errorMsg,
                  errorKind,
                }
              : d,
          ),
        );
      }
    },
    [documents, activeDocId, initReviewState],
  );

  // Procesamiento secuencial del lote (evita colapsar backend / rate-limits)
  const processAllPending = useCallback(async () => {
    setIsProcessingQueue(true);
    const pendingList = documents.filter((d) => d.status === 'pending');

    for (const doc of pendingList) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: 'scanning', error: undefined } : d)),
      );

      try {
        const res = await transport.extract({
          imageBase64: doc.file.base64,
          mimeType: doc.file.mimeType,
          filename: doc.file.filename,
        });
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: 'ready', result: res, error: undefined, errorKind: undefined }
              : d,
          ),
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error al procesar';
        const errorKind = err instanceof VisionTransportError ? err.errorKind : undefined;
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  status: 'error',
                  error: errorMsg,
                  errorKind,
                }
              : d,
          ),
        );
      }
    }
    setIsProcessingQueue(false);
  }, [documents]);

  // Cambiar documento activo
  const handleSelectActiveDoc = (docId: string) => {
    setActiveDocId(docId);
    setConfirmError(null);
    const doc = documents.find((d) => d.id === docId);
    if (doc?.result) {
      initReviewState(doc.result);
    }
  };

  // Cargar preset de demostración
  const handleSelectDemoPreset = (presetId: string) => {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId) ?? DEMO_PRESETS[0]!;
    const newDocId = `demo-${preset.id}-${Date.now()}`;
    const newDoc: QueueDocument = {
      id: newDocId,
      file: {
        base64: demoDocumentBase64(preset.filename),
        mimeType: 'application/pdf',
        filename: preset.filename,
      },
      isCustom: false,
      status: 'pending',
    };
    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocId(newDocId);
    setActiveTab('demo');
  };

  // Manejo de carga de archivos reales (soporta selección múltiple)
  const handleAddCustomFiles = useCallback((files: FileList | readonly File[]) => {
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) return;
      const mime = resolveMimeType(file);
      if (!mime) return;

      const reader = new FileReader();
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : '';
        const comma = raw.indexOf(',');
        const base64 = comma >= 0 ? raw.slice(comma + 1) : raw;

        const docItem: QueueDocument = {
          id: `custom-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file: {
            base64,
            mimeType: mime,
            filename: file.name,
          },
          isCustom: true,
          status: 'pending',
        };

        setDocuments((prev) => [docItem, ...prev]);
        setActiveDocId(docItem.id);
      };
      reader.readAsDataURL(file);
    });

    setActiveTab('custom');
  }, []);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddCustomFiles(e.target.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddCustomFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveDoc = (docId: string) => {
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId);
      if (activeDocId === docId && filtered.length > 0) {
        setActiveDocId(filtered[0]!.id);
      }
      return filtered;
    });
  };

  // Cálculo en vivo del monto total de la orden según líneas activas
  const activeLines = linesDecision.filter((l) => l.included);
  const estimatedTotal = activeLines.reduce((acc, line) => {
    const qty = parseFloat(line.quantity) || 0;
    const cost = parseFloat(line.unitCost) || 0;
    return acc + qty * cost;
  }, 0);

  // Confirmación Atómica de la Orden de Compra y Recepción
  const handleConfirmReceipt = () => {
    if (activeLines.length === 0) {
      setConfirmError('Debes incluir al menos un artículo para registrar la recepción.');
      return;
    }

    if (supplierDecision.mode === 'create' && !supplierDecision.name.trim()) {
      setConfirmError('Debes indicar el nombre del proveedor para darlo de alta.');
      return;
    }

    if (supplierDecision.mode === 'existing' && !supplierDecision.supplierId) {
      setConfirmError('Debes seleccionar un proveedor existente de la lista.');
      return;
    }

    setConfirmError(null);

    const payload: ConfirmVisionReceiptBody = {
      supplierDecision:
        supplierDecision.mode === 'create'
          ? {
              mode: 'create',
              name: supplierDecision.name.trim(),
              taxId: supplierDecision.taxId.trim() || undefined,
            }
          : {
              mode: 'existing',
              supplierId: supplierDecision.supplierId,
            },
      linesDecision: activeLines.map((l) =>
        l.mode === 'create'
          ? {
              mode: 'create',
              name: l.createName.trim() || l.description,
              sku: l.createSku.trim() || undefined,
              unit: l.createUnit.trim() || l.unit || 'und',
              quantity: l.quantity,
              unitCost: l.unitCost,
            }
          : {
              mode: 'existing',
              productId: l.productId,
              quantity: l.quantity,
              unitCost: l.unitCost,
            },
      ),
      documentMetadata: {
        filename: activeDoc?.file.filename || undefined,
        documentHash: activeDoc?.result?.documentHash || undefined,
        supplierReference: supplierReference.trim() || undefined,
        notes: receiptNotes.trim() || undefined,
      },
    };

    startConfirming(async () => {
      const result = await confirmVisionPurchaseReceiptAction(payload);
      if (result.ok) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === activeDocId ? { ...d, status: 'confirmed', confirmedReceipt: result } : d,
          ),
        );
      } else {
        setConfirmError(result.error ?? 'Ocurrió un error al confirmar la recepción.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Banner de estado de IA */}
      {aiStatus !== undefined &&
        (aiStatus?.configured ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-card border border-brand/30 bg-brand-soft/20 px-4 py-3 text-xs text-brand-ink">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand shrink-0" />
              <span>
                Visión Inteligente activa con <strong>{aiStatus.provider}</strong>{' '}
                {aiStatus.model ? `(${aiStatus.model})` : ''}
              </span>
            </div>
            <span className="text-[11px] text-muted">
              Tus documentos reales se interpretan en vivo con este modelo
            </span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-card border border-line bg-subtle/60 px-4 py-3 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-warn shrink-0" />
              <span>
                Modo demostración activo: la empresa no tiene una clave de IA configurada.
              </span>
            </div>
            {aiStatus?.canConfigure && (
              <Link
                href="/settings/ai"
                className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Configurar API Key</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        ))}

      {/* Selector de modo: Demostración asistida vs Subir comprobantes propios */}
      <div className="rounded-card border border-line bg-surface p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              <ScanLine className="size-5 text-brand" />
              Ingesta y Lectura de Documentos de Compra
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Procesa remitos, albaranes o facturas individuales o en lote con trazabilidad y alta
              atómica en inventario.
            </p>
          </div>

          <div className="inline-flex self-start sm:self-auto p-1 rounded-control bg-subtle border border-line text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('demo')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-all ${
                activeTab === 'demo'
                  ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Sparkles className="size-3.5 text-brand" />
              <span>Casos de Demostración</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-all ${
                activeTab === 'custom'
                  ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Upload className="size-3.5" />
              <span>Subir Documentos Reales</span>
            </button>
          </div>
        </div>

        {/* Pestaña: Casos de Demostración */}
        {activeTab === 'demo' && (
          <div className="pt-4 space-y-3">
            <p className="text-xs text-muted">
              Selecciona uno de los tres escenarios preparados para verificar el flujo de extracción
              y cotejo:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectDemoPreset(preset.id)}
                  className="flex flex-col items-start p-3.5 rounded-control border border-line bg-surface-raised hover:border-brand/50 hover:bg-subtle/50 transition-all text-left group"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="text-xs font-semibold text-ink group-hover:text-brand transition-colors">
                      {preset.label}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-brand-soft text-brand-ink">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pestaña: Subir Documentos Reales (Multi-archivo) */}
        {activeTab === 'custom' && (
          <div className="pt-4 space-y-3">
            {!aiStatus?.configured && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-control border border-warn/40 bg-warn-soft p-3 text-xs text-warn-ink">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Para procesar tus propios documentos se requiere conectar una clave de IA en
                    Ajustes. No se aplicará fallback a datos falsos para evitar contaminación de
                    catálogo.
                  </span>
                </div>
                {aiStatus?.canConfigure && (
                  <Link
                    href="/settings/ai"
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline shrink-0"
                  >
                    <span>Configurar ahora</span>
                    <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            )}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-control cursor-pointer transition-colors text-center ${
                isDragging
                  ? 'border-brand bg-brand-soft/20'
                  : 'border-line hover:border-brand/50 bg-subtle/30 hover:bg-subtle/60'
              }`}
            >
              <div className="grid size-10 place-items-center rounded-pill bg-brand-soft text-brand-ink mb-2 shadow-xs">
                <Upload className="size-5" />
              </div>
              <p className="text-xs font-semibold text-ink">
                Arrastra aquí tus remitos o facturas, o haz clic para seleccionar
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                Formatos compatibles: PDF, PNG, JPG, WebP (admite selección múltiple hasta 3.5 MB
                c/u)
              </p>
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleFileInputChange}
                className="sr-only"
              />
            </div>
          </div>
        )}
      </div>

      {/* Cola de documentos en lote */}
      {documents.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-brand" />
              <span className="text-xs font-semibold text-ink">
                Documentos cargados en cola ({documents.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {documents.some((d) => d.status === 'pending') && (
                <button
                  type="button"
                  onClick={() => {
                    void processAllPending();
                  }}
                  disabled={isProcessingQueue}
                  className={buttonClasses({
                    variant: 'secondary',
                    size: 'sm',
                    className: 'text-xs',
                  })}
                >
                  {isProcessingQueue ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      <span>Procesando cola...</span>
                    </>
                  ) : (
                    <>
                      <ScanLine className="size-3.5" />
                      <span>Analizar todos los pendientes</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {documents.map((doc) => {
              const isActive = doc.id === activeDocId;
              return (
                <div
                  key={doc.id}
                  onClick={() => handleSelectActiveDoc(doc.id)}
                  className={`p-3 rounded-control border text-left cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                    isActive
                      ? 'border-brand bg-brand-soft/20 shadow-xs'
                      : 'border-line bg-surface-raised hover:border-brand/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 text-brand shrink-0" />
                      <span className="text-xs font-semibold text-ink truncate">
                        {doc.file.filename}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDoc(doc.id);
                      }}
                      className="text-muted hover:text-danger p-0.5"
                      title="Eliminar de la lista"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div>
                      {doc.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <Clock className="size-3" />
                          Pendiente
                        </span>
                      )}
                      {doc.status === 'scanning' && (
                        <span className="inline-flex items-center gap-1 text-brand font-medium">
                          <RefreshCw className="size-3 animate-spin" />
                          Analizando...
                        </span>
                      )}
                      {doc.status === 'ready' && (
                        <span className="inline-flex items-center gap-1 text-ink font-semibold">
                          <CheckCircle2 className="size-3 text-brand" />
                          Listo para revisión
                        </span>
                      )}
                      {doc.status === 'confirmed' && (
                        <span className="inline-flex items-center gap-1 text-brand font-semibold">
                          <CheckCircle2 className="size-3 text-brand" />
                          {doc.confirmedReceipt?.receiptNumber ?? 'Registrado'}
                        </span>
                      )}
                      {doc.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-danger font-medium">
                          <AlertCircle className="size-3" />
                          Error al leer
                        </span>
                      )}
                    </div>

                    {doc.status === 'pending' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void scanDocument(doc.id);
                        }}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Analizar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vista Detallada de Revisión y Confirmación para el Documento Activo */}
      {activeDoc && (
        <div className="rounded-card border border-line bg-surface p-4 sm:p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  Documento activo: {activeDoc.file.filename}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill ${
                    !activeDoc.isCustom
                      ? 'bg-warn-soft text-warn-ink border border-warn/30'
                      : 'bg-brand-soft text-brand-ink border border-brand/30'
                  }`}
                >
                  {!activeDoc.isCustom ? 'Demostración' : 'Comprobante real'}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Revisa los datos interpretados, decide el alta o mapeo de entidades faltantes y
                confirma la recepción.
              </p>
            </div>

            {activeDoc.status === 'pending' && (
              <button
                type="button"
                onClick={() => {
                  void scanDocument(activeDoc.id);
                }}
                className={buttonClasses({ variant: 'primary', size: 'sm' })}
              >
                <ScanLine className="size-3.5" />
                <span>Analizar documento</span>
              </button>
            )}
          </div>

          {/* Estado de error en la lectura del documento */}
          {activeDoc.status === 'error' && (
            <div className="rounded-control border border-danger/30 bg-danger-soft p-4 text-xs text-danger-ink space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4 shrink-0 text-danger" />
                <span>No se pudo procesar el documento</span>
              </div>
              <p className="leading-relaxed">
                {activeDoc.errorKind === 'AiNotConfigured'
                  ? 'Para procesar documentos reales con visión inteligente se requiere configurar una clave de IA en los ajustes de la empresa.'
                  : (activeDoc.error ?? 'Ocurrió un error inesperado al analizar el archivo.')}
              </p>
              {activeDoc.errorKind === 'AiNotConfigured' && aiStatus?.canConfigure && (
                <div className="pt-1">
                  <Link
                    href="/settings/ai"
                    className="inline-flex items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 font-semibold text-white shadow-xs hover:bg-brand-hover text-xs transition-colors"
                  >
                    <span>Configurar clave de IA</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Formulario Interactivo de Confirmación cuando el documento está 'ready' o 'confirmed' */}
          {activeDoc.result && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Sección 1: Decisión del Proveedor */}
              <div className="rounded-card border border-line bg-surface-raised p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      1. Proveedor de la Recepción (Obligatorio)
                    </h4>
                    <span className="text-sm font-semibold text-ink block mt-0.5">
                      Extraído: &quot;{activeDoc.result.extraction.supplier || 'No detectado'}&quot;
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                      <input
                        type="radio"
                        name="supplierMode"
                        checked={supplierDecision.mode === 'create'}
                        onChange={() =>
                          setSupplierDecision((prev) => ({ ...prev, mode: 'create' }))
                        }
                        className="text-brand focus:ring-brand"
                      />
                      <span>Dar de alta nuevo</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                      <input
                        type="radio"
                        name="supplierMode"
                        checked={supplierDecision.mode === 'existing'}
                        onChange={() =>
                          setSupplierDecision((prev) => ({ ...prev, mode: 'existing' }))
                        }
                        className="text-brand focus:ring-brand"
                      />
                      <span>Vincular a existente</span>
                    </label>
                  </div>
                </div>

                {supplierDecision.mode === 'create' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted mb-1">
                        Razón Social / Nombre del Proveedor *
                      </label>
                      <input
                        type="text"
                        value={supplierDecision.name}
                        onChange={(e) =>
                          setSupplierDecision((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="Ej. Distribuidora Central, C.A."
                        className="w-full text-xs rounded-control border border-line bg-surface px-3 py-1.5 text-ink focus:outline-hidden focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted mb-1">
                        RIF / Identificación Fiscal (Opcional)
                      </label>
                      <input
                        type="text"
                        value={supplierDecision.taxId}
                        onChange={(e) =>
                          setSupplierDecision((prev) => ({ ...prev, taxId: e.target.value }))
                        }
                        placeholder="Ej. J-12345678-9"
                        className="w-full text-xs rounded-control border border-line bg-surface px-3 py-1.5 text-ink focus:outline-hidden focus:border-brand font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-muted mb-1">
                      Seleccionar Proveedor Registrado en la Empresa *
                    </label>
                    <select
                      value={supplierDecision.supplierId}
                      onChange={(e) =>
                        setSupplierDecision((prev) => ({ ...prev, supplierId: e.target.value }))
                      }
                      className="w-full text-xs rounded-control border border-line bg-surface px-3 py-2 text-ink focus:outline-hidden focus:border-brand"
                    >
                      {suppliers.length === 0 && (
                        <option value="">No hay proveedores en la empresa</option>
                      )}
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Sección 2: Tabla de Artículos Extraídos y Decisiones de Catálogo */}
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="border-b border-line bg-subtle/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      2. Artículos y Existencias
                    </h4>
                    <p className="text-xs text-muted mt-0.5">
                      Marca los artículos a incluir. Para ítems no reconocidos, decide si se dan de
                      alta o se asignan a un producto del catálogo.
                    </p>
                  </div>

                  <div className="text-xs font-semibold text-ink">
                    {activeLines.length} de {linesDecision.length} artículos incluidos
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-subtle/30 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-2.5 text-center w-10">Inc.</th>
                        <th className="px-3 py-2.5">Descripción Extraída</th>
                        <th className="px-3 py-2.5 text-right w-20">Cant.</th>
                        <th className="px-3 py-2.5 text-right w-24">Costo Unit.</th>
                        <th className="px-3 py-2.5 text-right w-24">Subtotal</th>
                        <th className="px-4 py-2.5">Acción en Catálogo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {linesDecision.map((line, idx) => {
                        const lineSubtotal =
                          (parseFloat(line.quantity) || 0) * (parseFloat(line.unitCost) || 0);

                        return (
                          <tr
                            key={`line-${idx}`}
                            className={`transition-colors ${
                              !line.included ? 'opacity-40 bg-subtle/30' : 'hover:bg-subtle/30'
                            }`}
                          >
                            <td className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={line.included}
                                onChange={(e) =>
                                  setLinesDecision((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, included: e.target.checked } : l,
                                    ),
                                  )
                                }
                                className="rounded-xs text-brand focus:ring-brand"
                              />
                            </td>

                            <td className="px-3 py-3 font-medium text-ink max-w-[200px] truncate">
                              {line.description}
                            </td>

                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                step="any"
                                value={line.quantity}
                                disabled={!line.included}
                                onChange={(e) =>
                                  setLinesDecision((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, quantity: e.target.value } : l,
                                    ),
                                  )
                                }
                                className="w-18 text-right text-xs rounded-control border border-line bg-surface px-2 py-1 text-ink focus:outline-hidden focus:border-brand font-mono"
                              />
                            </td>

                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                step="any"
                                value={line.unitCost}
                                disabled={!line.included}
                                onChange={(e) =>
                                  setLinesDecision((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, unitCost: e.target.value } : l,
                                    ),
                                  )
                                }
                                className="w-20 text-right text-xs rounded-control border border-line bg-surface px-2 py-1 text-ink focus:outline-hidden focus:border-brand font-mono"
                              />
                            </td>

                            <td className="px-3 py-3 text-right font-mono text-ink font-semibold">
                              ${lineSubtotal.toFixed(2)}
                            </td>

                            <td className="px-4 py-3">
                              {line.included && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLinesDecision((prev) =>
                                          prev.map((l, i) =>
                                            i === idx ? { ...l, mode: 'existing' } : l,
                                          ),
                                        )
                                      }
                                      className={`text-[11px] px-2 py-0.5 rounded-control transition-colors ${
                                        line.mode === 'existing'
                                          ? 'bg-brand text-white font-semibold shadow-xs'
                                          : 'bg-subtle text-muted hover:text-ink'
                                      }`}
                                    >
                                      En Catálogo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLinesDecision((prev) =>
                                          prev.map((l, i) =>
                                            i === idx ? { ...l, mode: 'create' } : l,
                                          ),
                                        )
                                      }
                                      className={`text-[11px] px-2 py-0.5 rounded-control transition-colors ${
                                        line.mode === 'create'
                                          ? 'bg-brand text-white font-semibold shadow-xs'
                                          : 'bg-subtle text-muted hover:text-ink'
                                      }`}
                                    >
                                      Crear Producto
                                    </button>
                                  </div>

                                  {line.mode === 'existing' ? (
                                    <select
                                      value={line.productId}
                                      onChange={(e) =>
                                        setLinesDecision((prev) =>
                                          prev.map((l, i) =>
                                            i === idx ? { ...l, productId: e.target.value } : l,
                                          ),
                                        )
                                      }
                                      className="w-full text-[11px] rounded-control border border-line bg-surface px-2 py-1 text-ink focus:outline-hidden focus:border-brand"
                                    >
                                      {products.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.sku} · {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                      <input
                                        type="text"
                                        placeholder="Nombre del producto"
                                        value={line.createName}
                                        onChange={(e) =>
                                          setLinesDecision((prev) =>
                                            prev.map((l, i) =>
                                              i === idx ? { ...l, createName: e.target.value } : l,
                                            ),
                                          )
                                        }
                                        className="text-[11px] rounded-control border border-line bg-surface px-2 py-1 text-ink focus:outline-hidden focus:border-brand"
                                      />
                                      <input
                                        type="text"
                                        placeholder="SKU"
                                        value={line.createSku}
                                        onChange={(e) =>
                                          setLinesDecision((prev) =>
                                            prev.map((l, i) =>
                                              i === idx ? { ...l, createSku: e.target.value } : l,
                                            ),
                                          )
                                        }
                                        className="text-[11px] rounded-control border border-line bg-surface px-2 py-1 text-ink focus:outline-hidden focus:border-brand font-mono"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sección 3: Metadatos de Trazabilidad y Confirmación Final */}
              <div className="rounded-card border border-brand/30 bg-brand-soft/20 p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted mb-1">
                      N° de Control / Referencia del Proveedor (Opcional)
                    </label>
                    <input
                      type="text"
                      value={supplierReference}
                      onChange={(e) => setSupplierReference(e.target.value)}
                      placeholder="Ej. FAC-00981"
                      className="w-full text-xs rounded-control border border-line bg-surface px-3 py-1.5 text-ink focus:outline-hidden focus:border-brand font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted mb-1">
                      Notas Internas / Trazabilidad
                    </label>
                    <input
                      type="text"
                      value={receiptNotes}
                      onChange={(e) => setReceiptNotes(e.target.value)}
                      placeholder="Observaciones de recepción"
                      className="w-full text-xs rounded-control border border-line bg-surface px-3 py-1.5 text-ink focus:outline-hidden focus:border-brand"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-line/60 pt-4">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                      Total Estimado de la Recepción
                    </span>
                    <span className="text-xl font-bold font-mono text-ink mt-0.5 block">
                      ${estimatedTotal.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-muted">
                        ({activeLines.length} artículos)
                      </span>
                    </span>
                  </div>

                  {/* Acciones principales de confirmación */}
                  <div className="flex items-center gap-3">
                    {activeDoc.status !== 'confirmed' ? (
                      <button
                        type="button"
                        onClick={handleConfirmReceipt}
                        disabled={isConfirming || activeLines.length === 0}
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'md',
                          className: 'shadow-xs',
                        })}
                      >
                        {isConfirming ? (
                          <>
                            <RefreshCw className="size-4 animate-spin" />
                            <span>Registrando en inventario...</span>
                          </>
                        ) : (
                          <>
                            <FileCheck className="size-4" />
                            <span>Confirmar Recepción de Mercancía</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/purchases/${activeDoc.confirmedReceipt?.receiptId}`}
                          className={buttonClasses({
                            variant: 'secondary',
                            size: 'md',
                          })}
                        >
                          <span>Ver Recepción ({activeDoc.confirmedReceipt?.receiptNumber})</span>
                          <ArrowRight className="size-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mensaje de error al confirmar */}
                {confirmError && (
                  <div className="rounded-control border border-danger/30 bg-danger-soft p-3 text-xs text-danger-ink flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0 text-danger" />
                    <span>{confirmError}</span>
                  </div>
                )}

                {/* Banner de Éxito al Confirmar */}
                {activeDoc.status === 'confirmed' && activeDoc.confirmedReceipt && (
                  <div className="rounded-control border border-brand/40 bg-surface p-4 text-xs text-ink shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-300">
                    <div className="flex items-start sm:items-center gap-3">
                      <CheckCircle2 className="size-5 text-brand shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">
                          Recepción {activeDoc.confirmedReceipt.receiptNumber} confirmada con éxito
                        </p>
                        <p className="text-muted mt-0.5">
                          Asignada a {activeDoc.confirmedReceipt.supplierName} por un total de $
                          {activeDoc.confirmedReceipt.total}. Existencias incrementadas atómicamente
                          en almacén.
                          {activeDoc.confirmedReceipt.createdSupplier && (
                            <span className="block text-brand font-medium">
                              ✓ Proveedor nuevo registrado en catálogo.
                            </span>
                          )}
                          {Boolean(activeDoc.confirmedReceipt.createdProductsCount) && (
                            <span className="block text-brand font-medium">
                              ✓ {activeDoc.confirmedReceipt.createdProductsCount} nuevo(s)
                              producto(s) dado(s) de alta en catálogo.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {activeDoc.confirmedReceipt.receiptId && (
                      <Link
                        href={`/purchases/${activeDoc.confirmedReceipt.receiptId}`}
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'sm',
                          className: 'shrink-0',
                        })}
                      >
                        <span>Ver Comprobante</span>
                        <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
