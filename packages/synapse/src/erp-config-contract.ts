import type { SynapseProvider, SynapseModel } from './types.ts';
import type { SynapseResult } from './ports.ts';

/**
 * Universal ERP AI Configuration Contract.
 * Any ERP implements this standardized specification so Synapse (or any external client)
 * can manage LLM connections, encryption and models consistently without technology lock-in.
 */
export interface ErpAiConfigBridge {
  /**
   * Obtiene la configuración de IA actual del tenant, omitiendo la llave secreta.
   */
  getSettings(): Promise<{
    configured: boolean;
    provider: SynapseProvider | null;
    model: string | null;
    baseUrl: string | null;
    apiKeyHint: string | null;
  }>;

  /**
   * Consulta al proveedor externo los modelos disponibles para la clave suministrada.
   */
  listModels(params: {
    provider: SynapseProvider;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<SynapseResult<readonly SynapseModel[]>>;

  /**
   * Valida y guarda de forma cifrada (AES-256-GCM) las credenciales de IA para el tenant.
   */
  saveSettings(params: {
    provider: SynapseProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<SynapseResult<{ saved: boolean }>>;

  /**
   * Desconecta el proveedor de IA y elimina las credenciales del tenant.
   */
  removeSettings(): Promise<{ removed: boolean }>;
}
