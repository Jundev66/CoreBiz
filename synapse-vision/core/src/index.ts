/**
 * @package @synapse-vision/core
 *
 * Synapse Vision es una capacidad agnóstica de lectura estructurada de documentos:
 * recibe una imagen de un documento de recepción y devuelve datos validados.
 *
 * No depende de CoreBiz, NestJS, Prisma, Supabase ni de un proveedor de IA concreto.
 * Puede integrarse en cualquier sistema implementando los puertos de `ports.ts`.
 *
 * LEE `AGENTS.md` antes de modificar este paquete.
 */
export * from './types';
export * from './documents';
export * from './ports';
export * from './contracts';
export * from './prompt';
export * from './demo';
export * from './demo-pdf';
export * from './security';
export * from './deduplication';
export * from './orchestrator';
