import { describe, expect, it } from 'vitest';
import { initialVisionUiState, visionUiReducer } from './machine';
import type { VisionExtractResponse } from '@synapse-vision/core';

const demoResponse: VisionExtractResponse = {
  mode: 'demo',
  extraction: {
    supplier: 'Distribuidora Central, C.A.',
    reference: 'NE-4502',
    issuedAt: '2026-10-14',
    currency: 'USD',
    lines: [{ description: 'Harina', quantity: 20, unit: 'bolsa', unitCost: 1.2 }],
  },
  matches: [],
  document: { filename: 'ejemplo.pdf', mimeType: 'application/pdf', base64: 'AAAA' },
};

describe('vision-ui · machine', () => {
  it('empieza en idle', () => {
    expect(initialVisionUiState().status).toBe('idle');
  });

  it('pasa a scanning al iniciar', () => {
    const state = visionUiReducer(initialVisionUiState(), { type: 'start' });
    expect(state.status).toBe('scanning');
  });

  it('guarda el resultado al tener éxito', () => {
    const state = visionUiReducer(
      { status: 'scanning' },
      { type: 'success', result: demoResponse },
    );
    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.result.mode).toBe('demo');
      expect(state.result.extraction.reference).toBe('NE-4502');
    }
  });

  it('expone el mensaje al fallar', () => {
    const state = visionUiReducer({ status: 'scanning' }, { type: 'failure', message: 'boom' });
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.message).toBe('boom');
  });

  it('vuelve a idle al limpiar, desde cualquier estado', () => {
    expect(
      visionUiReducer({ status: 'ready', result: demoResponse }, { type: 'reset' }).status,
    ).toBe('idle');
    expect(visionUiReducer({ status: 'error', message: 'x' }, { type: 'reset' }).status).toBe(
      'idle',
    );
  });
});
