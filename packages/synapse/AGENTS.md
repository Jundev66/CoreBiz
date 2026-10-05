# Synapse — Agente Operativo Universal

> **Leer antes de tocar cualquier archivo de este paquete.**
> Este documento es el contrato de diseño de Synapse. Las IAs que trabajen en este repo **deben** leerlo para entender qué es, qué no es, y cómo debe evolucionar.

---

## ¿Qué es Synapse?

Synapse es un **asistente operativo de negocio, tecnológicamente agnóstico**.

- NO es una feature de CoreBiz.
- NO depende de Next.js, NestJS, Prisma, Supabase ni ninguna tecnología concreta.
- ES un paquete autónomo (`@corebiz/synapse`) que puede ser adoptado por cualquier sistema de gestión empresarial: un backend en **Laravel, Spring Boot, FastAPI, Django, Rails**, o un frontend en **React, Vue, Angular, Svelte, o cualquier otro**.

El host (el sistema que lo adopta) implementa dos interfaces simples y Synapse hace el resto.

---

## Filosofía de diseño — Reglas Absolutas

Estas reglas **nunca se rompen**. Si una mejora las viola, la mejora está mal diseñada.

### 1. Cero dependencias de host

El paquete `packages/synapse/` solo puede depender de:

- `zod` (validación de esquemas)
- TypeScript puro

**Prohibido importar** desde `@corebiz/application`, `@corebiz/db`, `@corebiz/domain`, NestJS, Next.js, Prisma, Supabase, o cualquier paquete del monorepo que no sea genérico.

> **Razón:** Un equipo en Laravel o Python que quiera integrar Synapse debe poder leer solo este paquete y entender el contrato sin conocer CoreBiz.

### 2. La lógica de negocio va en el puente (Bridge), no en Synapse

Synapse se comunica con el host a través de dos puertos (`ErpBridgePort`, `LlmGatewayPort`). Todo lo que sea específico del negocio (usuarios, permisos, datos reales) vive en la implementación del Bridge que hace el host.

```
Host ERP (CoreBiz / Laravel / Java)
  └── implementa ErpBridgePort
        ├── getSystemInstructions(actor) → string
        └── getAvailableCapabilities(actor) → ErpScreenCapability[]

Synapse recibe el bridge y trabaja.
Synapse NUNCA llama a una base de datos directamente.
```

### 3. Doble modo siempre disponible

Synapse **siempre funciona**, con o sin IA configurada:

| Condición                              | Modo activado                             |
| -------------------------------------- | ----------------------------------------- |
| El host tiene API key válida de un LLM | `'llm'` — usa el gateway LLM              |
| No hay clave, o el proveedor falla     | `'deterministic'` — motor de reglas local |

**Nunca** se devuelve un error al usuario por "no hay IA". El modo determinista es el fallback.

### 4. Zero-data y Zero-execution son innegociables

El chatbot:

- **NO inventa** saldos, stocks, nombres de clientes, fechas ni ningún dato que no haya recibido explícitamente del host.
- **NO ejecuta** transacciones de forma invisible. Solo guía al usuario para que él opere el sistema.

Estas reglas deben mantenerse tanto en el system prompt como en el motor determinista.

### 5. Aislamiento de rol estricto

El contexto del actor (`ErpActorContext`) es **de solo lectura y provisto por el host**. Synapse no infiere, no eleva ni modifica permisos. Solo sugiere acciones dentro de lo que el actor tiene autorizado.

---

## Arquitectura interna

```
packages/synapse/src/
│
├── types.ts               ← Tipos y constantes públicas (providers, mensajes, errores)
├── ports.ts               ← Contratos (interfaces) que el host debe implementar
├── erp-config-contract.ts ← Contrato para gestión de configuración de IA (opcional para el host)
│
├── orchestrator.ts        ← Cerebro: decide si va por LLM o modo determinista
├── prompt-builder.ts      ← Construye el system prompt para el LLM a partir del bridge
├── deterministic-engine.ts← Motor de reglas/FAQ sin IA, con guías operativas universales
│
└── index.ts               ← Re-exporta todo (API pública del paquete)
```

### Flujo de una pregunta

```
Usuario escribe mensaje
        │
        ▼
SynapseOrchestrator.ask(actor, connection, conversation)
        │
        ├─ ¿Hay connection válida y gateway? ──► buildSynapsePrompt() → LlmGatewayPort.chat()
        │                                              reply { mode: 'llm' }
        │
        └─ No hay IA ─────────────────────────► executeDeterministicQuery()
                                                       reply { mode: 'deterministic' }
```

---

## Cómo agregar lógica al motor determinista

El motor determinista (`deterministic-engine.ts`) usa una lista de `ErpRuleGuide`. Para agregar un tema nuevo:

```typescript
// En COMMON_ERP_GUIDES, agregar una entrada:
{
  keywords: ['inventario', 'stock', 'existencias', 'almacen'],
  title: 'Control de Inventario',
  steps: [
    'Ve al módulo de Inventario o Almacén.',
    'Selecciona el producto para ver su existencia actual.',
    'Puedes registrar ajustes de entrada o salida manual.',
  ],
  targetPath: '/inventory',
  actions: [
    { label: 'Ir a Inventario', href: '/inventory' },
  ],
}
```

**Regla:** Los `keywords` deben ser en minúsculas y sin tildes (el motor normaliza la query con `.toLowerCase()`). Los `steps` deben ser instrucciones genéricas que funcionen en cualquier sistema de gestión, no solo en CoreBiz.

---

## Cómo agregar un proveedor LLM nuevo

1. Agregar el nombre del proveedor en `SYNAPSE_PROVIDERS` en `types.ts`.
2. Agregar sus `SynapseProviderTraits` en `SYNAPSE_PROVIDER_TRAITS` (¿necesita apiKey? ¿tiene URL custom?).
3. La implementación HTTP va **en el host** (en CoreBiz sería en `packages/infrastructure/`), implementando `LlmGatewayPort`.
4. Synapse no cambia. Solo el host agrega el adaptador HTTP.

---

## Cómo integrar Synapse en un host diferente a CoreBiz

> Ejemplo mínimo para un backend en **cualquier tecnología**.

El host debe:

1. **Implementar `ErpBridgePort`** — proveer las instrucciones del sistema y las capacidades disponibles para el usuario actual.
2. **Implementar `LlmGatewayPort`** (opcional) — si el host quiere conectar un LLM real. Sin esto, Synapse funciona en modo determinista.
3. **Instanciar `SynapseOrchestrator`** con las implementaciones.
4. **Construir `ErpActorContext`** a partir de la sesión autenticada del usuario.
5. **Llamar a `orchestrator.ask(actor, connection, messages)`** y devolver la respuesta.

```typescript
// Ejemplo de integración mínima (TypeScript/Node)
import { SynapseOrchestrator } from '@corebiz/synapse';
import { MiErpBridge } from './mi-erp-bridge';

const orchestrator = new SynapseOrchestrator({ erp: new MiErpBridge() });

const result = await orchestrator.ask(
  { userId: '123', tenantId: 'empresa-1', roleName: 'Vendedor', permissions: ['sales:read'] },
  null, // sin IA: modo determinista
  [{ role: 'user', content: '¿Cómo registro una venta?' }],
);
```

Para Laravel, Python, Java u otros lenguajes, la integración se hace llamando a la API del host de CoreBiz (si CoreBiz es el motor) o reimplementando los ports en el lenguaje del host.

---

## Mejoras pendientes / Hoja de ruta

Las mejoras se diseñan siempre **contra los ports**, nunca acopladas a CoreBiz:

| Área                        | Descripción                                                                                                       | Impacto en el contrato                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Datos en tiempo real**    | El bridge puede exponer un port de consulta de datos (stock, clientes) de solo lectura para el modo LLM           | Nuevo port opcional `ErpDataQueryPort`             |
| **Intención clasificada**   | El motor determinista puede recibir un clasificador de intención más sofisticado (regex → NLP local)              | Solo cambia internamente `deterministic-engine.ts` |
| **Memoria de conversación** | El host puede pasar un historial resumido en `getSystemInstructions()`                                            | Cero cambios en Synapse                            |
| **Acciones ejecutables**    | El bridge puede exponer acciones autorizadas que Synapse proponga y el host ejecute tras confirmación del usuario | Nuevo tipo `ErpExecutableAction` en ports          |
| **Multilenguaje**           | El system prompt puede parametrizarse por idioma del actor                                                        | Añadir `locale` a `ErpActorContext`                |
| **Métricas y feedback**     | El host reporta si la respuesta fue útil                                                                          | Nuevo port opcional `SynapseAnalyticsPort`         |

---

## Tests

Cada cambio en Synapse debe venir con tests en `src/synapse.test.ts` o nuevos archivos en `tests/`.

Los tests **no pueden** importar nada de CoreBiz. Usan implementaciones dummy de los ports.

```bash
pnpm test   # desde packages/synapse
```

---

## Vocabulario

| Término               | Significado                                                           |
| --------------------- | --------------------------------------------------------------------- |
| **Host**              | El sistema que integra Synapse (CoreBiz, otro ERP, etc.)              |
| **Bridge**            | La implementación de `ErpBridgePort` que hace el host                 |
| **Actor**             | El usuario autenticado en el host, representado por `ErpActorContext` |
| **Gateway**           | La implementación de `LlmGatewayPort` (el adaptador HTTP al LLM)      |
| **Modo determinista** | Respuesta sin IA, basada en reglas y keywords                         |
| **Modo LLM**          | Respuesta generada por un modelo de lenguaje externo                  |
