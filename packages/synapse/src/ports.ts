import type { SynapseMessage, SynapseModel, SynapseErrorKind, SynapseConnection } from './types';

export type SynapseResult<T, E = { kind: SynapseErrorKind; message?: string }> =
  { ok: true; value: T } | { ok: false; error: E };

export function synapseOk<T>(value: T): SynapseResult<T, never> {
  return { ok: true, value };
}

export function synapseErr<E>(error: E): SynapseResult<never, E> {
  return { ok: false, error };
}

/**
 * Universal ERP Navigation Screen descriptor.
 */
export interface ErpScreenCapability {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly requiredPermission?: string;
}

/**
 * Universal User Context provided by the host ERP.
 * Zero-trust: The chatbot only receives what the ERP explicitly authorizes for this caller.
 */
export interface ErpActorContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly roleName: string;
  readonly permissions: readonly string[];
  readonly isDemo?: boolean;
}

/**
 * Universal ERP Bridge Port.
 * Any ERP (CoreBiz, Odoo, SAP, Custom API) implements this interface to plug into Synapse.
 */
export interface ErpBridgePort {
  readonly erpName: string;
  /**
   * Returns metadata and guidelines for the system prompt.
   */
  getSystemInstructions(actor: ErpActorContext): string;

  /**
   * Returns list of ERP screens/capabilities the current actor is allowed to navigate or know about.
   */
  getAvailableCapabilities(actor: ErpActorContext): Promise<readonly ErpScreenCapability[]>;
}

/**
 * LLM Transport Gateway Port.
 * Speaks HTTP/REST to Ollama, OpenAI, Anthropic, Gemini without external SDK bloat.
 */
export interface LlmGatewayPort {
  listModels(connection: SynapseConnection): Promise<SynapseResult<readonly SynapseModel[]>>;
  chat(
    connection: SynapseConnection,
    messages: readonly SynapseMessage[],
    systemPrompt?: string,
  ): Promise<SynapseResult<{ reply: string }>>;
}
