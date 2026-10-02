import type { ErpActorContext, ErpBridgePort, LlmGatewayPort } from './ports';
import { synapseOk, type SynapseResult } from './ports';
import type { SynapseConnection, SynapseErrorKind, SynapseMessage } from './types';
import { buildSynapsePrompt } from './prompt-builder';
import { executeDeterministicQuery, type SynapseAction } from './deterministic-engine';

export interface SynapseOrchestratorDeps {
  readonly erp: ErpBridgePort;
  readonly gateway?: LlmGatewayPort;
}

export type SynapseChatResult = SynapseResult<
  {
    reply: string;
    mode: 'llm' | 'deterministic';
    suggestedPath?: string;
    actions?: readonly SynapseAction[];
  },
  { kind: SynapseErrorKind; message?: string }
>;

export class SynapseOrchestrator {
  constructor(private readonly deps: SynapseOrchestratorDeps) {}

  /**
   * Dual-mode ask method:
   * 1. If connection is provided and valid, routes to LLM Gateway.
   * 2. If no connection or missing key, routes seamlessly to Deterministic Rule Engine (No-AI mode).
   */
  async ask(
    actor: ErpActorContext,
    connection: SynapseConnection | null,
    conversation: readonly SynapseMessage[],
  ): Promise<SynapseChatResult> {
    const lastUserMessage = [...conversation].reverse().find((m) => m.role === 'user');
    const userQuery = lastUserMessage?.content ?? '';

    const hasValidAiConnection =
      Boolean(connection) &&
      (connection?.provider === 'ollama' || Boolean(connection?.apiKey)) &&
      Boolean(this.deps.gateway);

    if (!hasValidAiConnection) {
      // Modo Autónomo Sin IA
      const deterministicResponse = await executeDeterministicQuery(
        this.deps.erp,
        actor,
        userQuery,
      );

      return synapseOk({
        reply: deterministicResponse.reply,
        mode: 'deterministic',
        ...(deterministicResponse.suggestedPath
          ? { suggestedPath: deterministicResponse.suggestedPath }
          : {}),
        ...(deterministicResponse.actions ? { actions: deterministicResponse.actions } : {}),
      });
    }

    // Modo Con IA (LLM)
    const systemPrompt = await buildSynapsePrompt(this.deps.erp, actor);

    const gateway = this.deps.gateway!;
    const llmResult = await gateway.chat(connection!, conversation, systemPrompt);

    if (!llmResult.ok) {
      return llmResult;
    }

    return synapseOk({
      reply: llmResult.value.reply,
      mode: 'llm',
    });
  }
}
