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
export * from './types.ts';
export * from './ports.ts';
export * from './prompt-builder.ts';
export * from './deterministic-engine.ts';
export * from './orchestrator.ts';
export * from './erp-config-contract.ts';
