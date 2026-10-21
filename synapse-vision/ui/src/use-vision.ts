import { useCallback, useReducer } from 'react';
import type { VisionExtractRequest } from '@synapse-vision/core';
import { initialVisionUiState, visionUiReducer, type VisionUiState } from './machine';
import { VisionTransportError, type VisionTransport } from './transport';

export interface VisionFileInput {
  readonly base64: string;
  readonly mimeType: string;
  readonly filename?: string;
}

export interface UseVisionResult {
  readonly state: VisionUiState;
  readonly scan: (file: VisionFileInput) => Promise<void>;
  readonly reset: () => void;
}

/**
 * Conecta la máquina de estados con el transporte. Toda la lógica de la vista está aquí y
 * en `machine.ts`: el componente sólo pinta.
 */
export function useVision(transport: VisionTransport): UseVisionResult {
  const [state, dispatch] = useReducer(visionUiReducer, undefined, initialVisionUiState);

  const scan = useCallback(
    async (file: VisionFileInput): Promise<void> => {
      dispatch({ type: 'start' });

      const request: VisionExtractRequest =
        file.filename === undefined
          ? { imageBase64: file.base64, mimeType: file.mimeType }
          : { imageBase64: file.base64, mimeType: file.mimeType, filename: file.filename };

      try {
        const result = await transport.extract(request);
        dispatch({ type: 'success', result });
      } catch (error) {
        const errorKind = error instanceof VisionTransportError ? error.errorKind : undefined;
        dispatch({
          type: 'failure',
          message: error instanceof Error ? error.message : 'No se pudo leer el documento.',
          ...(errorKind !== undefined ? { errorKind } : {}),
        });
      }
    },
    [transport],
  );

  const reset = useCallback((): void => {
    dispatch({ type: 'reset' });
  }, []);

  return { state, scan, reset };
}
