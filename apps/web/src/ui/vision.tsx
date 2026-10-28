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
import { useTranslations } from 'next-intl';
import {
  FileText,
  ScanLine,
  Sparkles,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  FileCheck,
  RotateCcw,
} from 'lucide-react';
import {
  demoDocumentBase64,
  DEMO_FILENAME,
  type VisionExtractResponse,
} from '@synapse-vision/core';
import { createFetchVisionTransport, useVision, type VisionFileInput } from '@synapse-vision/ui';
import type { AssistantStatusView } from '@/api/ai';
import { buttonClasses } from '@/ui/button';
import {
  generateDeliveryNoteFromVisionAction,
  type GenerateDeliveryNoteResult,
} from '@/actions/vision';

const transport = createFetchVisionTransport({ endpoint: '/api/vision/extract' });
const MAX_FILE_SIZE_BYTES = 3.5 * 1024 * 1024;

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function formatFileBadge(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'Documento PDF';
  if (mimeType === 'image/png') return 'Imagen PNG';
  if (mimeType === 'image/jpeg') return 'Imagen JPG';
  if (mimeType === 'image/webp') return 'Imagen WebP';
  return 'Archivo';
}

function resolveMimeType(file: File): string | null {
  if (['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}

function getFriendlyVisionErrorMessage(
  state: Extract<ReturnType<typeof useVision>['state'], { status: 'error' }>,
  t: (key: string) => string,
): string {
  const kind = state.errorKind;
  if (kind === 'InvalidFormat') return t('errors.invalidFormat');
  if (kind === 'PayloadTooLarge') return t('errors.payloadTooLarge');
  if (kind === 'AiTimeout') return t('errors.aiTimeout');
  if (kind === 'AiProviderUnreachable') return t('errors.aiProviderUnreachable');
  if (kind === 'AiKeyRejected') return t('errors.aiKeyRejected');
  if (kind === 'AiModelUnavailable') return t('errors.aiModelUnavailable');
  if (kind === 'AiRateLimited') return t('errors.aiRateLimited');
  if (kind === 'Forbidden') return t('errors.forbidden');
  if (kind === 'AiNotConfigured') return t('errors.aiNotConfigured');

  // Si el mensaje contiene fragmentos técnicos con códigos HTTP, evitar mostrarlos a usuarios no técnicos
  if (
    !state.message ||
    /host respondio|status code|internal server/i.test(state.message) ||
    /\b(500|502|504|400|404|413|422|429)\b/.test(state.message)
  ) {
    return t('errors.unexpected');
  }

  return state.message;
}

function defaultSampleFile(): VisionFileInput {
  return {
    base64: demoDocumentBase64(),
    mimeType: 'application/pdf',
    filename: DEMO_FILENAME,
  };
}

export interface DirectActionResult {
  readonly ok: boolean;
  readonly error?: string | undefined;
  readonly number?: string | undefined;
  readonly id?: string | undefined;
  readonly entityName?: string | undefined;
  readonly viewHref?: string | undefined;
  readonly successTitle?: string | undefined;
  readonly successSubtitle?: string | undefined;
}

export interface VisionScanProps {
  readonly title: string;
  readonly aiStatus?: AssistantStatusView | null | undefined;
  readonly onApplyExtraction?: ((res: VisionExtractResponse) => void) | undefined;
  readonly applyButtonLabel?: string | undefined;
  readonly onDirectAction?:
    ((res: VisionExtractResponse) => Promise<DirectActionResult>) | undefined;
  readonly directActionLabel?: string | undefined;
  readonly directActionTitle?: string | undefined;
  readonly directActionDescription?: string | undefined;
}

export function VisionScan({
  title,
  aiStatus,
  onApplyExtraction,
  applyButtonLabel,
  onDirectAction,
  directActionLabel,
  directActionTitle,
  directActionDescription,
}: VisionScanProps): ReactElement {
  const t = useTranslations('vision');
  const fileInputId = useId();
  const { state, scan, reset } = useVision(transport);
  const [selectedFile, setSelectedFile] = useState<VisionFileInput>(defaultSampleFile);
  const [isCustomUpload, setIsCustomUpload] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerateDeliveryNoteResult | null>(null);
  const [directActionResult, setDirectActionResult] = useState<DirectActionResult | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUploadedFile = useCallback(
    (file: File): void => {
      setClientError(null);
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setClientError(t('errors.payloadTooLarge'));
        return;
      }

      const mime = resolveMimeType(file);
      if (mime === null) {
        setClientError(
          'El formato del archivo no es compatible. Por favor, sube una imagen (PNG, JPG, WEBP) o un documento PDF.',
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');
        const base64 = comma >= 0 ? result.slice(comma + 1) : result;
        setSelectedFile({
          base64,
          mimeType: mime,
          filename: file.name,
        });
        setIsCustomUpload(true);
        setGenerationResult(null);
      };
      reader.onerror = () => {
        setClientError('No se pudo leer el archivo seleccionado.');
      };
      reader.readAsDataURL(file);
    },
    [t],
  );

  const handleSelectCustomFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      if (file) {
        processUploadedFile(file);
      }
    },
    [processUploadedFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        processUploadedFile(file);
      }
    },
    [processUploadedFile],
  );

  const handleUseSample = useCallback((): void => {
    setClientError(null);
    setSelectedFile(defaultSampleFile());
    setIsCustomUpload(false);
    setGenerationResult(null);
    setDirectActionResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    reset();
  }, [reset]);

  const handleSwitchToCustom = useCallback((): void => {
    setClientError(null);
    setIsCustomUpload(true);
    setGenerationResult(null);
    setDirectActionResult(null);
    reset();
  }, [reset]);

  const handleScan = useCallback((): void => {
    setClientError(null);
    setGenerationResult(null);
    setDirectActionResult(null);
    void scan(selectedFile);
  }, [selectedFile, scan]);

  const handleReset = useCallback((): void => {
    setClientError(null);
    setSelectedFile(defaultSampleFile());
    setIsCustomUpload(false);
    setGenerationResult(null);
    setDirectActionResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    reset();
  }, [reset]);

  const handleActionExecute = useCallback(
    (res: VisionExtractResponse): void => {
      startGenerating(async () => {
        if (onDirectAction) {
          const result = await onDirectAction(res);
          setDirectActionResult(result);
        } else {
          const result = await generateDeliveryNoteFromVisionAction(res.extraction, res.matches);
          setGenerationResult(result);
        }
      });
    },
    [onDirectAction],
  );

  return (
    <div className="space-y-5">
      {/* Banner de estado del proveedor de IA */}
      {aiStatus !== undefined &&
        (aiStatus?.configured ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-card border border-brand/30 bg-brand-soft/20 px-3.5 py-2.5 text-xs text-brand-ink">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand shrink-0" />
              <span>
                Proveedor de IA activo en tu empresa:{' '}
                <strong className="capitalize">{aiStatus.provider}</strong>
                {aiStatus.model ? ` (${aiStatus.model})` : ''}
              </span>
            </div>
            <span className="text-[11px] text-muted">
              Tus documentos se interpretarán en vivo con este modelo
            </span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-card border border-line bg-subtle/60 px-3.5 py-2.5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-warn shrink-0" />
              <span>
                Modo demostración activo: la empresa aún no tiene una API key configurada.
              </span>
            </div>
            {aiStatus?.canConfigure && (
              <Link
                href="/settings/ai"
                className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1 shrink-0"
              >
                Configurar API Key
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        ))}

      {/* Selector de origen: Documento de demostración vs Subir archivo propio */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-semibold text-ink flex items-center gap-2">
            <ScanLine className="size-4 text-brand" />
            {title}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {isCustomUpload ? t('customTabSubtitle') : t('demoTabSubtitle')}
          </p>
        </div>

        <div className="inline-flex self-start sm:self-auto p-1 rounded-control bg-subtle border border-line text-xs font-medium shrink-0">
          <button
            type="button"
            onClick={handleUseSample}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-all ${
              !isCustomUpload
                ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Sparkles className="size-3.5 text-brand" />
            <span>{t('sampleDocumentReady')}</span>
          </button>

          <button
            type="button"
            onClick={handleSwitchToCustom}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-all ${
              isCustomUpload
                ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Upload className="size-3.5" />
            <span>{t('uploadCustom')}</span>
          </button>
        </div>
      </div>

      {/* Guía contextual para cuando se elige subir un archivo propio pero la empresa no tiene IA conectada */}
      {isCustomUpload && !aiStatus?.configured && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-card border border-brand/30 bg-brand-soft/20 p-4 text-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <Sparkles className="size-4 text-brand shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-brand-ink">
                ¿Querés procesar tus propios remitos y facturas con IA real?
              </p>
              <p className="text-muted leading-relaxed">{t('needsAiKeyNotice')}</p>
            </div>
          </div>
          {aiStatus?.canConfigure && (
            <Link
              href="/settings/ai"
              className="inline-flex items-center gap-1.5 shrink-0 rounded-control bg-brand px-3 py-1.5 font-semibold text-white shadow-xs hover:bg-brand-hover text-xs transition-colors self-start sm:self-auto"
            >
              <span>{t('configureAiCta')}</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      )}

      {/* Zona de Dropzone interactiva cuando se elige subir archivo propio y aún no hay archivo subido */}
      {isCustomUpload && selectedFile.filename === DEMO_FILENAME ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-card cursor-pointer transition-colors text-center ${
            isDragging
              ? 'border-brand bg-brand-soft/20'
              : 'border-line hover:border-brand/50 bg-surface-raised hover:bg-subtle/50'
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <div className="grid size-12 place-items-center rounded-pill bg-brand-soft text-brand-ink mb-3 shadow-xs">
            <Upload className="size-6" />
          </div>
          <p className="text-sm font-semibold text-ink">{t('dragDropPrompt')}</p>
          <p className="text-xs text-muted mt-1">{t('dragDropHint')}</p>
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={handleSelectCustomFile}
            className="sr-only"
          />
        </div>
      ) : (
        /* Tarjeta de previsualización del documento seleccionado (ejemplo o propio) */
        <div className="rounded-card border border-line bg-surface-raised p-4 transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              {selectedFile.mimeType.startsWith('image/') ? (
                <img
                  src={`data:${selectedFile.mimeType};base64,${selectedFile.base64}`}
                  alt="Vista previa del documento"
                  className="size-14 rounded-control border border-line object-cover bg-surface shrink-0 shadow-xs"
                />
              ) : (
                <div className="grid size-11 place-items-center rounded-control bg-brand-soft text-brand-ink shrink-0">
                  <FileText className="size-5" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-ink truncate max-w-xs">
                    {selectedFile.filename ?? 'documento'}
                  </span>
                  {!isCustomUpload ? (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
                      <Sparkles className="size-3" />
                      {t('demoBadge')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-subtle border border-line px-2 py-0.5 text-xs font-medium text-ink">
                      {aiStatus?.configured ? 'Listo para IA' : 'Archivo cargado'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  <span className="font-medium text-ink-soft">
                    {formatFileBadge(selectedFile.mimeType)}
                  </span>
                  {' · '}
                  {!isCustomUpload ? t('sampleDocumentHint') : t('fileReadyToScan')}
                </p>
              </div>
            </div>

            {/* Acciones principales - con flex-wrap para que nunca se corten los botones */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {!isCustomUpload && (
                <a
                  href={`data:application/pdf;base64,${selectedFile.base64}`}
                  download={DEMO_FILENAME}
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  title="Descargar el documento para verlo"
                >
                  <Download className="size-4" />
                  <span>{t('sampleDocumentDownload')}</span>
                </a>
              )}

              {isCustomUpload && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={state.status === 'scanning'}
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                  >
                    <Upload className="size-3.5" />
                    <span>{t('changeFile')}</span>
                  </button>
                  <input
                    id={fileInputId}
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={handleSelectCustomFile}
                    className="sr-only"
                  />
                </>
              )}

              <button
                type="button"
                onClick={handleScan}
                disabled={state.status === 'scanning'}
                className={buttonClasses({
                  variant: 'primary',
                  size: 'sm',
                  className: 'shadow-xs',
                })}
              >
                {state.status === 'scanning' ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>{t('scanning')}</span>
                  </>
                ) : (
                  <>
                    <ScanLine className="size-4" />
                    <span>{t('scanTitle')}</span>
                  </>
                )}
              </button>

              {(state.status === 'ready' || state.status === 'error' || isCustomUpload) && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={state.status === 'scanning'}
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  title={t('clean')}
                >
                  <RotateCcw className="size-3.5" />
                  <span>{t('clean')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alerta de Error de cliente o backend con explicaciones legibles */}
      {(clientError !== null || state.status === 'error') && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-control border border-danger/30 bg-danger-soft p-3.5 text-sm text-danger-ink animate-in fade-in duration-200"
        >
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="size-5 shrink-0 mt-0.5 sm:mt-0 text-danger" />
            <p className="font-medium leading-snug">
              {clientError ??
                (state.status === 'error' ? getFriendlyVisionErrorMessage(state, t) : null)}
            </p>
          </div>
          {state.status === 'error' &&
            state.errorKind === 'AiNotConfigured' &&
            aiStatus?.canConfigure && (
              <Link
                href="/settings/ai"
                className="inline-flex items-center gap-1.5 shrink-0 rounded-control bg-brand px-3 py-1.5 font-semibold text-white shadow-xs hover:bg-brand-hover text-xs transition-colors self-start sm:self-auto"
              >
                <span>Configurar API Key</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
        </div>
      )}

      {/* Resultados de la extracción */}
      {state.status === 'ready' && (
        <div className="space-y-5 pt-2 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Extracción completada</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
                  state.result.mode === 'demo'
                    ? 'border border-warn/40 bg-warn-soft text-warn-ink'
                    : 'border border-brand/40 bg-brand-soft text-brand-ink'
                }`}
              >
                {state.result.mode === 'demo' ? (
                  <>
                    <span className="size-1.5 rounded-full bg-warn" />
                    {t('demoBadge')}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-brand" />
                    {aiStatus?.provider ? `Modelo ${aiStatus.provider}` : 'Modelo de IA en vivo'}
                  </>
                )}
              </span>
            </div>
            <span className="text-xs text-muted max-w-md sm:text-right">
              {state.result.mode === 'demo' ? t('demoResultNotice') : t('customResultNotice')}
            </span>
          </div>

          {/* Tarjeta de Metadatos del Documento */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-card border border-line bg-surface p-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                {t('supplier')}
              </span>
              <span className="text-sm font-semibold text-ink mt-1 block truncate">
                {state.result.extraction.supplier || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                {t('reference')}
              </span>
              <span className="text-sm font-semibold text-ink mt-1 block font-mono">
                {state.result.extraction.reference || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                {t('date')}
              </span>
              <span className="text-sm font-semibold text-ink mt-1 block">
                {state.result.extraction.issuedAt || '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                {t('currency')}
              </span>
              <span className="text-sm font-semibold text-ink mt-1 block font-mono">
                {state.result.extraction.currency || 'USD'}
              </span>
            </div>
          </div>

          {/* Tabla de Artículos Extraídos y Cotejados */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="border-b border-line bg-subtle/60 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">{t('extractionSummary')}</span>
              <span className="text-xs text-muted">
                {state.result.extraction.lines.length}{' '}
                {state.result.extraction.lines.length === 1 ? 'artículo' : 'artículos'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-subtle/30 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2.5">{t('itemDescription')}</th>
                    <th className="px-3 py-2.5 text-right">{t('quantity')}</th>
                    <th className="px-3 py-2.5">{t('unit')}</th>
                    <th className="px-3 py-2.5 text-right">{t('unitCost')}</th>
                    <th className="px-4 py-2.5">{t('matchedProduct')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {state.result.extraction.lines.map((line, index) => {
                    const match = state.result.matches[index]?.[0];
                    return (
                      <tr
                        key={`${line.description}-${index}`}
                        className="hover:bg-subtle/40 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-medium text-ink">{line.description}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                          {line.quantity}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{line.unit}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink font-mono">
                          {line.unitCost.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5">
                          {match ? (
                            <div className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft/70 px-2.5 py-1 text-xs font-medium text-brand-ink">
                              <CheckCircle2 className="size-3.5 text-brand shrink-0" />
                              <span className="truncate max-w-[180px]">{match.name}</span>
                              <span className="text-[11px] font-mono opacity-70">
                                ({match.sku})
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted italic">{t('noMatch')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque de Acción: Cargar en el Formulario o Registrar Documento Directamente */}
          <div className="rounded-card border border-brand/20 bg-brand-soft/20 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="max-w-md">
                <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <FileCheck className="size-4 text-brand" />
                  {directActionTitle ??
                    (onApplyExtraction
                      ? t('applyToFormTitle')
                      : 'Demostración del flujo completo de ERP')}
                </h4>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {directActionDescription ??
                    (onApplyExtraction
                      ? t('applyToFormDescription')
                      : 'Podés registrar automáticamente el comprobante en tu empresa activa, afectando inventario, saldos y correlativos con aislamiento multi-tenant estricto.')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* Botón de acción directa (registrar de una vez) */}
                {(onDirectAction || !onApplyExtraction) &&
                  !directActionResult?.ok &&
                  !generationResult?.ok && (
                    <button
                      type="button"
                      onClick={() => handleActionExecute(state.result)}
                      disabled={isGenerating}
                      className={buttonClasses({
                        variant: 'primary',
                        size: 'md',
                        className: 'shadow-xs',
                      })}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          <span>{t('generating')}</span>
                        </>
                      ) : (
                        <>
                          <FileText className="size-4" />
                          <span>
                            {directActionLabel ??
                              (onDirectAction
                                ? 'Registrar comprobante'
                                : t('generateDeliveryNote'))}
                          </span>
                        </>
                      )}
                    </button>
                  )}

                {/* Botón para pre-cargar y revisar en el formulario */}
                {onApplyExtraction && (
                  <button
                    type="button"
                    onClick={() => onApplyExtraction(state.result)}
                    className={buttonClasses({
                      variant: onDirectAction ? 'secondary' : 'primary',
                      size: 'md',
                      className: 'shadow-xs',
                    })}
                  >
                    <FileCheck className="size-4" />
                    <span>{applyButtonLabel ?? t('applyToForm')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Resultado de la acción directa parametrizada (ej. Compras) */}
            {directActionResult && (
              <div
                className={`mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-control p-3.5 text-sm ${
                  directActionResult.ok
                    ? 'border border-brand/40 bg-surface text-ink shadow-xs'
                    : 'border border-danger/40 bg-danger-soft text-danger-ink'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {directActionResult.ok ? (
                    <CheckCircle2 className="size-5 text-brand shrink-0" />
                  ) : (
                    <AlertCircle className="size-5 text-danger shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">
                      {directActionResult.ok
                        ? (directActionResult.successTitle ??
                          `Comprobante ${directActionResult.number} registrado con éxito`)
                        : 'No se pudo completar la operación'}
                    </span>
                    <span className="text-xs text-muted">
                      {directActionResult.ok
                        ? (directActionResult.successSubtitle ??
                          `Asignado a ${directActionResult.entityName} en la empresa activa.`)
                        : directActionResult.error}
                    </span>
                  </div>
                </div>

                {directActionResult.ok && directActionResult.viewHref && (
                  <Link
                    href={directActionResult.viewHref}
                    className={buttonClasses({
                      variant: 'secondary',
                      size: 'sm',
                      className: 'shrink-0',
                    })}
                  >
                    <span>Ver comprobante</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}

            {/* Resultado de la Generación directa clásica (demostración de notas de entrega) */}
            {!onDirectAction && generationResult && (
              <div
                className={`mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-control p-3.5 text-sm ${
                  generationResult.ok
                    ? 'border border-brand/40 bg-surface text-ink shadow-xs'
                    : 'border border-danger/40 bg-danger-soft text-danger-ink'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {generationResult.ok ? (
                    <CheckCircle2 className="size-5 text-brand shrink-0" />
                  ) : (
                    <AlertCircle className="size-5 text-danger shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold block">
                      {generationResult.ok
                        ? `Nota de entrega ${generationResult.noteNumber} generada con éxito`
                        : 'No se pudo generar la nota de entrega'}
                    </span>
                    <span className="text-xs text-muted">
                      {generationResult.ok
                        ? `Asignada al cliente ${generationResult.customerName} en la empresa activa.`
                        : generationResult.error}
                    </span>
                  </div>
                </div>

                {generationResult.ok && generationResult.noteId && (
                  <Link
                    href={`/delivery-notes/${generationResult.noteId}`}
                    className={buttonClasses({
                      variant: 'secondary',
                      size: 'sm',
                      className: 'shrink-0',
                    })}
                  >
                    <span>{t('viewGeneratedNote')}</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
