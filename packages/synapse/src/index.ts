/**
 * @package @corebiz/synapse
 *
 * Synapse es un asistente operativo de negocio agnóstico de tecnología.
 * No depende de CoreBiz, NestJS, Prisma, Supabase ni ningún stack concreto.
 * Puede integrarse en cualquier sistema (Laravel, Spring Boot, FastAPI, Rails, etc.)
 * implementando los ports definidos en `ports.ts`.
 *
 * LEE `AGENTS.md` antes de modificar este paquete.
 */
export * from './types';
export * from './ports';
export * from './prompt-builder';
export * from './deterministic-engine';
export * from './orchestrator';
export * from './erp-config-contract';
export * from './security';
