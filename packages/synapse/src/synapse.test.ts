import { describe, it, expect } from 'vitest';
import { SynapseOrchestrator } from './orchestrator';
import { buildSynapsePrompt } from './prompt-builder';
import type { ErpBridgePort, ErpActorContext, LlmGatewayPort } from './ports';
import { synapseOk } from './ports';

describe('Synapse Architecture & Dual-Mode Engine', () => {
  const dummyErp: ErpBridgePort = {
    erpName: 'TestERP',
    getSystemInstructions: () => 'Normas fiscales de prueba.',
    getAvailableCapabilities: (actor) => {
      if (actor.permissions.includes('sales:read')) {
        return Promise.resolve([
          { path: '/sales', name: 'Ventas', description: 'Módulo de ventas y notas' },
        ]);
      }
      return Promise.resolve([
        { path: '/customers', name: 'Clientes', description: 'Gestión de clientes y saldos' },
      ]);
    },
  };

  it('generates role and capability bounded prompt for LLM', async () => {
    const actor: ErpActorContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      roleName: 'Ventas',
      permissions: ['sales:read'],
    };

    const prompt = await buildSynapsePrompt(dummyErp, actor);
    expect(prompt).toContain('TestERP');
    expect(prompt).toContain('Ventas (/sales): Módulo de ventas y notas');
    expect(prompt).toContain('ZERO-DATA');
  });

  it('functions seamlessly in deterministic mode when NO AI connection is configured', async () => {
    const orchestrator = new SynapseOrchestrator({
      erp: dummyErp,
    });

    // Sin conexión a ningún LLM
    const result = await orchestrator.ask(
      { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
      null,
      [{ role: 'user', content: '¿Cómo creo un cliente nuevo?' }],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('deterministic');
      expect(result.value.reply).toContain('Gestión de Clientes');
      expect(result.value.reply).toContain('Modo Local sin IA');
    }
  });

  it('responds with main menu guide when user greets or asks for help', async () => {
    // 'hola' y 'opciones' coinciden con la guía del Menú Principal en el motor determinista.
    const orchestrator = new SynapseOrchestrator({
      erp: dummyErp,
    });

    const result = await orchestrator.ask(
      { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
      null,
      [{ role: 'user', content: 'hola, que puedes hacer?' }],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('deterministic');
      // La guía del menú principal tiene prioridad sobre el fallback genérico.
      expect(result.value.reply).toContain('Menú Principal de Opciones');
    }
  });

  it('falls back to listing authorized capabilities for completely unknown queries', async () => {
    const orchestrator = new SynapseOrchestrator({
      erp: dummyErp,
    });

    const result = await orchestrator.ask(
      { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
      null,
      [{ role: 'user', content: 'cuánto es 2+2?' }],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('deterministic');
      // El fallback lista las capacidades disponibles del actor.
      expect(result.value.reply).toContain('Asistente Operativo Synapse');
    }
  });

  it('routes to LLM gateway when valid AI connection is present', async () => {
    const dummyGateway: LlmGatewayPort = {
      listModels: () => Promise.resolve(synapseOk([])),
      chat: () => Promise.resolve(synapseOk({ reply: 'Respuesta generada por Claude 3.5' })),
    };

    const orchestrator = new SynapseOrchestrator({
      erp: dummyErp,
      gateway: dummyGateway,
    });

    const result = await orchestrator.ask(
      { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: ['sales:read'] },
      { provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-test' },
      [{ role: 'user', content: 'Explícame el flujo de ventas' }],
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('llm');
      expect(result.value.reply).toBe('Respuesta generada por Claude 3.5');
    }
  });

  describe('Error Diagnosis & Cybersecurity Guardrails (without AI)', () => {
    it('diagnoses EmailAlreadyRegistered in deterministic mode with business explanation', async () => {
      const orchestrator = new SynapseOrchestrator({ erp: dummyErp });
      const result = await orchestrator.ask(
        { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
        null,
        [{ role: 'user', content: '¿Por qué me sale el error de correo ya existente?' }],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('deterministic');
        expect(result.value.reply).toContain('Correo ya registrado');
        expect(result.value.reply).toContain('Cómo resolverlo:');
        expect(result.value.actions).toEqual([{ label: 'Ir a Iniciar Sesión', href: '/login' }]);
      }
    });

    it('diagnoses InsufficientStock in deterministic mode with clear action buttons', async () => {
      const orchestrator = new SynapseOrchestrator({ erp: dummyErp });
      const result = await orchestrator.ask(
        { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
        null,
        [{ role: 'user', content: 'me dio error de stock insuficiente' }],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('deterministic');
        expect(result.value.reply).toContain('Stock insuficiente en almacén');
        expect(result.value.suggestedPath).toBe('/products');
      }
    });

    it('picks up active errorContext when user asks why it failed', async () => {
      const orchestrator = new SynapseOrchestrator({ erp: dummyErp });
      const result = await orchestrator.ask(
        { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
        null,
        [{ role: 'user', content: '¿Por qué falló?' }],
        { kind: 'CreditLimitExceeded', incidentId: null },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('deterministic');
        expect(result.value.reply).toContain('Límite de crédito excedido');
        expect(result.value.reply).toContain('Cómo resolverlo:');
      }
    });

    it('protects incident details and redacts sensitive data from outputs', async () => {
      const orchestrator = new SynapseOrchestrator({ erp: dummyErp });
      const result = await orchestrator.ask(
        { userId: 'u1', tenantId: 't1', roleName: 'Admin', permissions: [] },
        null,
        [{ role: 'user', content: '¿Qué pasó con el fallo?' }],
        { kind: 'Unexpected', incidentId: 'INC-A1B2C3D4' },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('deterministic');
        expect(result.value.reply).toContain('INC-A1B2C3D4');
        expect(result.value.reply).not.toContain('stack');
      }
    });
  });
});
