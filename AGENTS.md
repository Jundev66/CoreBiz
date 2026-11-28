# Enterprise Architecture Standards & Agent Delegation Roster (CoreBiz)

## Hard Rules (Inviolable)

1. **Zero External Access & Navigation Lock**:
   - Este repositorio es un proyecto autónomo. Las pruebas automatizadas (Playwright, Vitest) se ejecutan por defecto contra el entorno local (`http://localhost:3000` / `http://localhost:3001`).
   - Ningún agente o script debe intentar navegar a URLs externas, sistemas de terceros o plataformas productivas en la nube, **con la única excepción explícita autorizada por el propietario**: verificación controlada en el sandbox demo público `https://corebiz-web.vercel.app/demo` (y sus rutas de sesión demo en `https://corebiz-web.vercel.app`).
2. **Zero Comments Policy**: No comments (`//`, `/* */`, or `#`) in source code. Code must be 100% self-documenting through intention-revealing names, Value Objects, and strict typing.
3. **Strict SOLID Compliance**:
   - **S (Single Responsibility)**: 1 controller = 1 cohesive business action. Prohibido crear controladores monstruosos o agrupar lógica dispar.
   - **O (Open/Closed)**: Multi-country fiscal logic implemented via `FiscalJurisdictionPort` and Strategy Pattern. Adding a new country never modifies existing tested code.
   - **L (Liskov Substitution)**: Any repository or fiscal engine implementation fulfills interface contracts without side effects.
   - **I (Interface Segregation)**: Fine-grained interfaces tailored to specific consumer needs.
   - **D (Dependency Inversion)**: Domain and Application layers depend strictly on abstract ports/interfaces, never on Prisma, Postgres, NestJS or HTTP frameworks directly.
4. **Zero Footprint & OpSec Anti-Attribution Lock**:
   - Prohibido de forma absoluta quemar o enviar nombres personales, nombres de empresas reales, clientes o datos privados en fixtures, seeds o pruebas automatizadas.
   - **Datos 100% genéricos y sintéticos:** Usar exclusivamente nombres genéricos abstractos (`Empresa Demo C.A.`, `Cliente de Prueba 01`, RIFs sintéticos `J-12345678-9`, EINs sintéticos `12-3456789`).

## Core Architecture Tenets (SOLID & 100% Hexagonal DDD)

- **Monorepo Structure (Turborepo & pnpm workspaces)**:
  - `packages/domain`: Reglas de negocio puras, Agregados, Entidades, Value Objects, Eventos de Dominio y Puertos de interfaz. CERO dependencias externas.
  - `packages/application`: Casos de uso (Commands/Queries/Handlers), servicios de aplicación y puertos secundarios. Solo depende de `packages/domain`.
  - `packages/contracts`: Esquemas Zod y DTOs fuertemente tipados compartidos entre frontend, backend y clientes externos.
  - `packages/infrastructure`: Adaptadores de PostgreSQL con RLS, repositorios Prisma, Unit of Work, adaptadores de pasarelas fiscales y limitadores de tasa.
  - `apps/api`: NestJS 11 REST API. Adaptador primario de entrega que expone controladores, autenticación JWT, guards de membresía, idempotencia y Swagger/OpenAPI.
  - `apps/web`: Next.js 16 (App Router & React 19) con Repository Pattern, TanStack Query y Zustand.
  - `apps/pos`: Vite SPA offline-first para puntos de venta.
- **Double-Entry Accounting Invariant**: $\sum \text{Débitos} \equiv \sum \text{Créditos}$ en todo asiento contable. Asientos desbalanceados son rechazados en el dominio antes de tocar la base de datos.
- **Multi-Country Fiscal Engine (`FiscalJurisdictionPort`)**: Motor tributario desacoplado:
  - Adaptador Venezuela (`VenezuelaFiscalEngine`): SENIAT (Providencias SNAT/2026/00084 y 00093), RIF, IVA (16%, 8%, 0%), IGTF (3%), retenciones de IVA/ISLR, Libros de Compras y Ventas, integración con Imprentas Digitales / Proveedores de Facturación Electrónica autorizados.
  - Adaptador Estados Unidos (`UnitedStatesFiscalEngine`): Sales Tax configurable por estado/condado/ciudad, EIN, certificados de exención y soporte para 1099.
- **Multi-Tenant Security & PostgreSQL RLS**: RLS estricto (`tenant_id = current_setting('app.current_tenant_id')`) en todas las tablas sensibles. Inyección de contexto de tenant en cada transacción y validación de membresía del usuario.
- **Testing Discipline**:
  - Unitarios con Vitest y Object Mothers (`packages/domain` y `packages/application`).
  - Integración contra PostgreSQL real con Docker.
  - E2E con Playwright ejecutando la matriz de pruebas adversarial de 4 niveles en sandbox local.

---

## Modular Subagents Roster

- **Accounting Specialist**: `.agents/accounting-specialist.md` (Partida Doble, Invariante Débitos == Créditos, Catálogo de Cuentas, Libro Diario, Libro Mayor, Balanza)
- **Fiscal & Legal Specialist**: `.agents/fiscal-legal-specialist.md` (Fiscalidad Multi-País: SENIAT Venezuela SNAT/2026/00084 y 00093, US Sales Tax/EIN, Retenciones, Libros Fiscales)
- **Invoicing Specialist**: `.agents/invoicing-specialist.md` (Ciclo de Factura, Cobros Parciales/Totales, Saldos Vivos, Notas de Crédito/Débito, Estados)
- **Backend Worker**: `.agents/backend-worker.md` (NestJS 11, Hexagonal DDD, TypeScript, Prisma, PostgreSQL RLS, Single Action Controllers, RFC 7807)
- **Frontend Worker**: `.agents/frontend-worker.md` (Next.js 16 App Router, React 19, Repository Pattern, TanStack Query, Zustand, Zod)
- **QA Playwright**: `.agents/qa-playwright.md` (Page Object Models, Fixtures Multi-Tenant, Matriz Adversarial de 4 Niveles, Pruebas de Estrés Financiero)
- **Domain Analyst**: `.agents/domain-analyst.md` (Agregados Ricos, Value Objects, Invariantes, CQRS, Lenguaje Ubicuo)
- **Cybersecurity Auditor**: `.agents/cybersecurity-auditor.md` (OWASP API Top 10, BOLA, JWT & Tenant Membership, RLS en Postgres, Idempotency)
- **AI Specialist**: `.agents/ai-specialist.md` (LLM Integration, RAG con `pgvector`, Structured Outputs, Guardrails)
- **API Documenter**: `.agents/api-documenter.md` (OpenAPI, DTOs Zod, Catálogo de Errores RFC 7807)
- **Data OpSec Specialist**: `.agents/data-opsec-specialist.md` (Datos Sintéticos, Anonimización, Cero Atribución)
