/**
 * Tipos y constantes públicas de Synapse Vision.
 *
 * Agnóstico de host y de proveedor: nada aquí conoce CoreBiz ni un modelo concreto.
 */

export const VISION_MODES = ['model', 'demo'] as const;
export type VisionMode = (typeof VISION_MODES)[number];

/**
 * Contexto del actor, provisto y autorizado por el host.
 * Sólo lectura: Synapse Vision no infiere ni eleva permisos.
 */
export interface VisionActorContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly roleName: string;
  readonly permissions: readonly string[];
}

/**
 * Conexión al modelo de visión. Se corresponde con la configuración de IA del host.
 * `provider` es libre a propósito: el paquete no impone una lista de proveedores.
 */
export interface VisionConnection {
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly model?: string | null;
}

export type VisionErrorKind =
  | 'AiNotConfigured'
  | 'AiProviderUnreachable'
  | 'AiKeyRejected'
  | 'AiModelUnavailable'
  | 'AiRateLimited'
  | 'Forbidden'
  | 'InvalidFormat';

export interface VisionError {
  readonly kind: VisionErrorKind;
  readonly message?: string;
}

export type VisionResult<T, E = VisionError> = { ok: true; value: T } | { ok: false; error: E };

export function visionOk<T>(value: T): VisionResult<T, never> {
  return { ok: true, value };
}

export function visionErr<E>(error: E): VisionResult<never, E> {
  return { ok: false, error };
}

/** Referencia a un documento (bytes en memoria) que el host o la vista pueden servir. */
export interface VisionDocument {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}
