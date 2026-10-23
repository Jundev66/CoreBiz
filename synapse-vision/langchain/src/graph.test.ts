import { describe, expect, it } from 'vitest';
import {
  demoExtraction,
  visionOk,
  type ProductMatch,
  type VisionActorContext,
  type VisionBridgePort,
  type VisionConnection,
  type VisionDocumentCachePort,
  type VisionDocumentCacheRecord,
  type VisionModelPort,
} from '@synapse-vision/core';
import { LangGraphVisionOrchestrator } from './graph';

const actor: VisionActorContext = {
  userId: 'u1',
  tenantId: 't1',
  roleName: 'Almacen',
  permissions: ['purchasing:write'],
};

const connection: VisionConnection = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-vl',
};

function fakeBridge(overrides: Partial<VisionBridgePort> = {}): VisionBridgePort {
  return {
    erpName: 'TestERP',
    currency: 'USD',
    canIngest: () => true,
    matchProduct: (): Promise<readonly ProductMatch[]> =>
      Promise.resolve([{ productId: 'p1', sku: 'HAR-01', name: 'Harina', confidence: 0.95 }]),
    resolveSupplier: () => Promise.resolve(null),
    ...overrides,
  };
}

describe('LangGraphVisionOrchestrator — Nodos y Flujo de Estados', () => {
  it('deduplica por hash y omite la extracción del modelo (0 tokens)', async () => {
    let modelCalls = 0;
    const model: VisionModelPort = {
      extract: () => {
        modelCalls++;
        return Promise.resolve(visionOk(demoExtraction()));
      },
    };

    const store = new Map<string, VisionDocumentCacheRecord>();
    const cache: VisionDocumentCachePort = {
      get: (_act, hash) => Promise.resolve(store.get(hash) ?? null),
      set: (_act, record) => {
        store.set(record.documentHash, record);
        return Promise.resolve();
      },
    };

    const orchestrator = new LangGraphVisionOrchestrator({
      bridge: fakeBridge(),
      model,
      cache,
    });

    const image = { imageBase64: 'ZG9jdW1lbnRvLXBydWViYS0x', mimeType: 'image/png' };

    // 1. Ingesta inicial: procesa y persiste en caché
    const first = await orchestrator.extract(actor, connection, image);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.cached).toBe(false);
      expect(first.value.documentHash).toBeDefined();
    }
    expect(modelCalls).toBe(1);

    // 2. Segunda ingesta del mismo documento: LangGraph bifurca al nodo de caché
    const second = await orchestrator.extract(actor, connection, image);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.cached).toBe(true);
      expect(second.value.documentHash).toBe(first.ok ? first.value.documentHash : '');
    }
    expect(modelCalls).toBe(1); // No consumió tokens del modelo de visión
  });

  it('ejecuta el pipeline completo con enriquecimiento RAG del catálogo', async () => {
    const model: VisionModelPort = {
      extract: () =>
        Promise.resolve(
          visionOk({
            supplier: 'Distribuidora Central',
            reference: 'NE-999',
            issuedAt: '2026-10-22',
            currency: 'USD',
            lines: [{ description: 'Aceite de Maiz 1L', quantity: 10, unit: 'caja', unitCost: 15 }],
          }),
        ),
    };

    let ragSearches = 0;
    const bridge = fakeBridge({
      matchProduct: (_act, desc) => {
        ragSearches++;
        expect(desc).toBe('Aceite de Maiz 1L');
        return Promise.resolve([
          { productId: 'prod-aceite', sku: 'ACE-01', name: 'Aceite de Maíz 1L', confidence: 0.98 },
        ]);
      },
    });

    const orchestrator = new LangGraphVisionOrchestrator({ bridge, model });
    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'aW1hZ2UtYWNlaXRl',
      mimeType: 'image/jpeg',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('model');
      expect(result.value.extraction.reference).toBe('NE-999');
      expect(result.value.matches[0]?.[0]?.sku).toBe('ACE-01');
      expect(ragSearches).toBe(1);
    }
  });

  it('entra en modo demo de forma limpia si no hay modelo disponible', async () => {
    const orchestrator = new LangGraphVisionOrchestrator({
      bridge: fakeBridge(),
      model: undefined,
    });

    const result = await orchestrator.extract(actor, null, {
      imageBase64: 'ZG9jdW1lbnRvLWRlbW8=',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('demo');
      expect(result.value.document).toBeDefined();
      expect(result.value.extraction.lines.length).toBeGreaterThan(0);
    }
  });

  it('detiene el flujo si la validación de esquema Zod falla', async () => {
    const model: VisionModelPort = {
      extract: () =>
        Promise.resolve(
          visionOk({
            // Estructura rota: falta líneas y datos requeridos
            invalido: true,
          }),
        ),
    };

    const orchestrator = new LangGraphVisionOrchestrator({
      bridge: fakeBridge(),
      model,
    });

    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'ZG9jdW1lbnRvLWJhZA==',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidFormat');
    }
  });

  it('rechaza una imagen con formato inválido antes de invocar el modelo', async () => {
    const orchestrator = new LangGraphVisionOrchestrator({
      bridge: fakeBridge(),
    });

    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'not-base64!@#$',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('InvalidFormat');
    }
  });
});
