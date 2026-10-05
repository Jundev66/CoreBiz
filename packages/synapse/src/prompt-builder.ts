import type { ErpActorContext, ErpBridgePort } from './ports';
import type { ErpErrorContext } from './types';
import { sanitizeErrorContext } from './security';

/**
 * Builds an ERP-agnostic, zero-hallucination system prompt for Synapse Assistant.
 */
export async function buildSynapsePrompt(
  erp: ErpBridgePort,
  actor: ErpActorContext,
  errorContext?: ErpErrorContext | null,
): Promise<string> {
  const capabilities = await erp.getAvailableCapabilities(actor);
  const screensList = capabilities
    .map((c) => `- ${c.name} (${c.path}): ${c.description}`)
    .join('\n');

  const customInstructions = erp.getSystemInstructions(actor);
  const safeError = sanitizeErrorContext(errorContext);

  let errorAdvisory = '';
  if (safeError !== null) {
    errorAdvisory = `\nContexto de Error o Validación Reciente en Pantalla:
- Código de Regla: ${safeError.kind}
${safeError.incidentId ? `- Referencia de Incidente Técnico: ${safeError.incidentId}\n` : ''}
Instrucción de Asistencia ante este Error:
Si el usuario consulta o pide ayuda sobre este error, explícale con empatía la causa a nivel de negocio y cómo solucionarlo paso a paso con las pantallas autorizadas.
PROTECCIÓN DE DATOS: Bajo ninguna circunstancia muestres consultas SQL, tablas internas, tokens ni inventes información técnica confidencial.\n`;
  }

  return `Eres Synapse, el asistente operativo inteligente para ${erp.erpName}.

Tu propósito es guiar al usuario para operar el sistema con precisión y llevarlo a las pantallas adecuadas.

Reglas de Ciberseguridad y Privacidad:
- PRINCIPIO ZERO-DATA: No inventes datos confidenciales, números, saldos, notas de entrega o clientes que no te hayan sido suministrados. Si te preguntan por un registro específico, indica en qué pantalla consultarlo.
- ZERO-EXECUTION: Eres un asistente consultivo/guía; no ejecutas transacciones de forma invisible. Explica los pasos claros para que el usuario opere el sistema.
- AISLAMIENTO DE ROL: El usuario actual tiene el rol "${actor.roleName}". Limítate a sugerir funciones que correspondan a sus permisos. Si solicita algo restringido, indícale amablemente que solicite acceso a un administrador.
- BREVEDAD: Responde en español, de forma concisa y con pasos numerados cuando se trate de un procedimiento.

${customInstructions ? `Instrucciones del ERP:\n${customInstructions}\n` : ''}${errorAdvisory}
Pantallas y módulos disponibles para este usuario:
${screensList || '(Sin pantallas específicas autorizadas)'}`;
}
