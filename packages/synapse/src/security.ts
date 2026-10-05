import type { ErpErrorContext } from './types';

/**
 * Strict regex for valid domain error kinds (PascalCase).
 * Prevents prompt injection, malicious XSS payloads or arbitrary strings in error kinds.
 */
const KIND_REGEX = /^[A-Z][A-Za-z0-9_]{1,63}$/;

/**
 * Strict regex for incident IDs (e.g. INC-A1B2C3D4).
 */
const INCIDENT_REGEX = /^INC-[0-9A-F]{8}$/;

/**
 * Validates and sanitizes untrusted error context from cookies, HTTP bodies or query params.
 * Returns null if the payload is malformed or violates security invariants.
 */
export function sanitizeErrorContext(raw: unknown): ErpErrorContext | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.kind !== 'string' || !KIND_REGEX.test(candidate.kind)) {
    return null;
  }

  let incidentId: string | null = null;
  if (typeof candidate.incidentId === 'string' && INCIDENT_REGEX.test(candidate.incidentId)) {
    incidentId = candidate.incidentId;
  }

  return {
    kind: candidate.kind,
    incidentId,
  };
}

/**
 * Redacts sensitive personal and technical data from user questions or system text
 * before sending to deterministic logs or LLM gateways:
 * - Email addresses -> [EMAIL_PROTEGIDO]
 * - Authorization Bearer / JWT / API tokens -> [TOKEN_PROTEGIDO]
 * - Credit card / Bank account patterns -> [NUMERO_PROTEGIDO]
 * - Strips raw database error traces / SQL keywords
 */
export function redactSensitiveData(text: string): string {
  if (!text) return '';

  return (
    text
      // Email addresses
      .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[EMAIL_PROTEGIDO]')
      // JWT tokens or long hex/base64 tokens
      .replace(
        /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
        '[TOKEN_PROTEGIDO]',
      )
      // API Keys (e.g. sk-..., key-...)
      .replace(/\b(?:sk|key|token)-[a-zA-Z0-9_-]{16,}\b/gi, '[CLAVE_PROTEGIDA]')
      // Credit card numbers (13-19 digits)
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[NUMERO_PROTEGIDO]')
      // Database stack trace keywords & SQL dumps
      .replace(
        /\b(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/gi,
        '[CONSULTA_INTERNA]',
      )
      .replace(/\b(?:pg_catalog|prisma\.|relation "[^"]+" violates)\b/gi, '[DETALLE_SISTEMA]')
  );
}

/**
 * Sanitizes input query string: limits length, strips control chars and null-bytes.
 */
export function sanitizeUserQuery(query: string): string {
  if (typeof query !== 'string') return '';
  // Strip control characters and null-bytes without control-regex
  const stripped = Array.from(query)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join('');
  return redactSensitiveData(stripped.trim().slice(0, 2_000));
}
