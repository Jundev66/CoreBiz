import type { VisionExtractResponse } from '@synapse-vision/core';

/**
 * La máquina de estados de la vista, sin React.
 *
 * Vive aparte para que sus transiciones se prueben en Node, sin montar componentes: el
 * comportamiento (qué se ve en cada momento) es lógica, no presentación.
 */

export type VisionUiState =
  | { readonly status: 'idle' }
  | { readonly status: 'scanning' }
  | { readonly status: 'ready'; readonly result: VisionExtractResponse }
  | { readonly status: 'error'; readonly message: string; readonly errorKind?: string | undefined };

export type VisionUiEvent =
  | { readonly type: 'start' }
  | { readonly type: 'success'; readonly result: VisionExtractResponse }
  | { readonly type: 'failure'; readonly message: string; readonly errorKind?: string | undefined }
  | { readonly type: 'reset' };

export function initialVisionUiState(): VisionUiState {
  return { status: 'idle' };
}

export function visionUiReducer(state: VisionUiState, event: VisionUiEvent): VisionUiState {
  switch (event.type) {
    case 'start':
      return { status: 'scanning' };
    case 'success':
      return { status: 'ready', result: event.result };
    case 'failure':
      return {
        status: 'error',
        message: event.message,
        ...(event.errorKind !== undefined ? { errorKind: event.errorKind } : {}),
      };
    case 'reset':
      return initialVisionUiState();
    default:
      return state;
  }
}
