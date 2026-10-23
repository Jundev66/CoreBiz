import { describe, expect, it } from 'vitest';
import { demoDocument, demoDocumentLines, demoExtraction } from './demo';
import { parseVisionExtraction, visionExtractionSchema } from './documents';
import { VisionOrchestrator } from './orchestrator';
import type { ProductMatch, VisionBridgePort, VisionModelPort } from './ports';
import { redactExtraction, redactSensitiveData, validateImageInput } from './security';
import {
  computeDocumentHash,
  type VisionDocumentCachePort,
  type VisionDocumentCacheRecord,
} from './deduplication';
import { visionExtractRequestSchema, visionExtractResponseSchema } from './contracts';
import { visionErr, visionOk, type VisionActorContext, type VisionConnection } from './types';

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

function bridge(overrides: Partial<VisionBridgePort> = {}): VisionBridgePort {
  return {
    erpName: 'TestERP',
    currency: 'USD',
    canIngest: () => true,
    matchProduct: (): Promise<readonly ProductMatch[]> =>
      Promise.resolve([{ productId: 'p1', sku: 'HAR-01', name: 'Harina', confidence: 0.9 }]),
    resolveSupplier: () => Promise.resolve(null),
    ...overrides,
  };
}

describe('Synapse Vision — modo demo (sin IA configurada)', () => {
  it('construye un PDF real y determinista a partir de los datos de ejemplo', () => {
    const document = demoDocument();
    const head = new TextDecoder().decode(document.bytes.slice(0, 8));
    expect(head).toBe('%PDF-1.4');
    expect(document.mimeType).toBe('application/pdf');
    expect(document.filename.endsWith('.pdf')).toBe(true);
    expect(document.bytes.length).toBeGreaterThan(400);

    // La tabla xref apunta dentro del archivo: el último objeto debe quedar antes de %%EOF.
    const text = new TextDecoder().decode(document.bytes);
    expect(text).toContain('startxref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('la extracción de ejemplo cumple el contrato y el PDF coincide con ella', () => {
    const extraction = demoExtraction();
    expect(visionExtractionSchema.safeParse(extraction).success).toBe(true);

    const lines = demoDocumentLines(extraction).join('\n');
    expect(lines).toContain(extraction.supplier);
    expect(lines).toContain(extraction.reference);
    for (const line of extraction.lines) {
      expect(lines).toContain(line.description);
    }
  });

  it('el orquestador sin puerto de modelo devuelve siempre modo demo', async () => {
    const orchestrator = new VisionOrchestrator({ bridge: bridge() });
    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'AAAA',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('demo');
      expect(result.value.document?.mimeType).toBe('application/pdf');
      expect(result.value.extraction.lines.length).toBeGreaterThan(0);
    }
  });

  it('sin conexión también responde demo, nunca un error por "no hay IA"', async () => {
    const model: VisionModelPort = {
      extract: () => Promise.resolve(visionErr({ kind: 'AiProviderUnreachable' })),
    };
    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model });

    const result = await orchestrator.extract(actor, null, {
      imageBase64: 'AAAA',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe('demo');
  });
});

describe('Synapse Vision — modo modelo', () => {
  it('pide la extracción, la valida y resuelve los productos con el bridge', async () => {
    const seen: string[] = [];
    const model: VisionModelPort = {
      extract: (input) => {
        seen.push(input.mimeType);
        return Promise.resolve(visionOk({ ...demoExtraction(), supplier: 'Proveedor Real' }));
      },
    };
    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model });
    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'AAAA',
      mimeType: 'image/jpeg',
    });

    expect(seen).toEqual(['image/jpeg']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('model');
      expect(result.value.extraction.supplier).toBe('Proveedor Real');
      expect(result.value.matches).toHaveLength(result.value.extraction.lines.length);
      expect(result.value.matches[0]?.[0]?.sku).toBe('HAR-01');
      expect(result.value.document).toBeUndefined();
    }
  });

  it('una salida inválida del modelo es InvalidFormat, no un dato inventado', async () => {
    const model: VisionModelPort = {
      extract: () => Promise.resolve(visionOk({ supplier: '', lines: [] })),
    };
    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model });
    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'AAAA',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('InvalidFormat');
  });

  it('un modelo en blanco degrada a demo en lugar de intentar llamar', async () => {
    let called = false;
    const model: VisionModelPort = {
      extract: () => {
        called = true;
        return Promise.resolve(visionOk(demoExtraction()));
      },
    };
    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model });
    const result = await orchestrator.extract(
      actor,
      { ...connection, model: '  ' },
      {
        imageBase64: 'AAAA',
        mimeType: 'image/png',
      },
    );

    expect(called).toBe(false);
    if (result.ok) expect(result.value.mode).toBe('demo');
  });
});

describe('Synapse Vision — contrato y validación de entrada', () => {
  it('parseVisionExtraction acepta una extracción válida y rechaza un objeto vacío', () => {
    expect(parseVisionExtraction(demoExtraction())).not.toBeNull();
    expect(parseVisionExtraction({})).toBeNull();
    expect(parseVisionExtraction({ supplier: 'X' })).toBeNull();
  });

  it('rechaza mime types no soportados y base64 malformado', () => {
    expect(validateImageInput({ imageBase64: 'AAAA', mimeType: 'image/png' })).toBeNull();
    expect(validateImageInput({ imageBase64: 'AAAA', mimeType: 'text/plain' })).not.toBeNull();
    expect(validateImageInput({ imageBase64: 'no!!', mimeType: 'image/png' })).not.toBeNull();
    expect(validateImageInput({ imageBase64: '', mimeType: 'image/png' })).not.toBeNull();
  });

  it('las formas HTTP de petición y respuesta validan', () => {
    expect(
      visionExtractRequestSchema.safeParse({ imageBase64: 'AAAA', mimeType: 'image/png' }).success,
    ).toBe(true);

    const response = {
      mode: 'demo' as const,
      extraction: demoExtraction(),
      matches: [],
      document: { filename: 'x.pdf', mimeType: 'application/pdf', base64: 'AAAA' },
    };
    expect(visionExtractResponseSchema.safeParse(response).success).toBe(true);
  });

  it('el contrato rechaza payloads sin tope (base64 gigante y demasiadas coincidencias)', () => {
    const hugeBase64 = 'A'.repeat(30_000_000 + 1);
    expect(
      visionExtractRequestSchema.safeParse({ imageBase64: hugeBase64, mimeType: 'image/png' })
        .success,
    ).toBe(false);

    const tooManyMatches = Array.from({ length: 201 }, () => []);
    expect(
      visionExtractResponseSchema.safeParse({
        mode: 'demo',
        extraction: demoExtraction(),
        matches: tooManyMatches,
      }).success,
    ).toBe(false);
  });
});

describe('Synapse Vision — redacción de datos sensibles', () => {
  it('redacta correos y tokens del texto libre', () => {
    expect(redactSensitiveData('contacto: ventas@proveedor.com')).toBe(
      'contacto: [EMAIL_PROTEGIDO]',
    );
    expect(redactSensitiveData('token sk-abcdefghijklmnopqrstuvwxyz')).toContain(
      '[TOKEN_PROTEGIDO]',
    );
  });

  it('redactExtraction limpia supplier, referencia, descripciones y notas', () => {
    const redacted = redactExtraction({
      supplier: 'Proveedor C.A. cxc@proveedor.com',
      reference: 'NE-1',
      issuedAt: '2026-10-14',
      currency: 'USD',
      lines: [
        { description: 'Harina (pedido de juan@x.com)', quantity: 1, unit: 'bolsa', unitCost: 1 },
      ],
      notes: 'avisar a compras@x.com',
    });

    expect(redacted.supplier).toContain('[EMAIL_PROTEGIDO]');
    expect(redacted.lines[0]?.description).toContain('[EMAIL_PROTEGIDO]');
    expect(redacted.notes).toContain('[EMAIL_PROTEGIDO]');
    expect(redacted.reference).toBe('NE-1');
  });

  it('el orquestador redacta la salida del modelo antes de devolverla', async () => {
    const model: VisionModelPort = {
      extract: () =>
        Promise.resolve(
          visionOk({
            ...demoExtraction(),
            notes: 'contactar a proveedor@secreto.com',
            supplier: 'Proveedor X (admin@x.com)',
          }),
        ),
    };
    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model });
    const result = await orchestrator.extract(actor, connection, {
      imageBase64: 'AAAA',
      mimeType: 'image/png',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extraction.notes).not.toContain('proveedor@secreto.com');
      expect(result.value.extraction.supplier).not.toContain('admin@x.com');
    }
  });
});

describe('Synapse Vision — deduplicación determinista y ahorro de tokens', () => {
  it('calcula hash SHA-256 determinista para una imagen en base64', async () => {
    const hash1 = await computeDocumentHash('aW1hZ2UtYnl0ZXMtMQ==');
    const hash2 = await computeDocumentHash('aW1hZ2UtYnl0ZXMtMQ==');
    const hash3 = await computeDocumentHash('aW1hZ2UtYnl0ZXMtMg==');

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('devuelve resultado desde caché y no llama al modelo de IA en documento duplicado', async () => {
    let modelCalls = 0;
    const model: VisionModelPort = {
      extract: () => {
        modelCalls++;
        return Promise.resolve(visionOk(demoExtraction()));
      },
    };

    const cacheStore = new Map<string, VisionDocumentCacheRecord>();
    const cache: VisionDocumentCachePort = {
      get: (_act, docHash) => Promise.resolve(cacheStore.get(docHash) ?? null),
      set: (_act, record) => {
        cacheStore.set(record.documentHash, record);
        return Promise.resolve();
      },
    };

    const orchestrator = new VisionOrchestrator({ bridge: bridge(), model, cache });
    const image = { imageBase64: 'ZG9jdW1lbnRvLWlkZW50aWNv', mimeType: 'image/png' };

    // Primera llamada: consume modelo y persiste en cache
    const firstResult = await orchestrator.extract(actor, connection, image);
    expect(firstResult.ok).toBe(true);
    if (firstResult.ok) {
      expect(firstResult.value.cached).toBe(false);
      expect(firstResult.value.documentHash).toBeDefined();
    }
    expect(modelCalls).toBe(1);

    // Segunda llamada con exactamente la misma imagen: HIT de cache, 0 llamadas a modelo
    const secondResult = await orchestrator.extract(actor, connection, image);
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      expect(secondResult.value.cached).toBe(true);
      expect(secondResult.value.documentHash).toBe(
        firstResult.ok ? firstResult.value.documentHash : '',
      );
    }
    expect(modelCalls).toBe(1); // Cero llamadas adicionales al modelo -> Ahorro total de tokens
  });
});
