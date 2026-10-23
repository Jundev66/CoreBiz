# Synapse Vision LangChain — Orquestación y Grafo de Estados con LangGraph

> **Leer antes de tocar cualquier archivo de este paquete.**

Este paquete implementa el orquestador de **Synapse Vision** mediante un grafo de estados tipado
usando **LangGraph** (`@langchain/langgraph`).

---

## Filosofía de diseño y mejores prácticas

### 1. Nodos especializados vs. "Agentes conversacionales"

No se utilizan agentes LLM libres que chatean entre sí: eso multiplicaría el consumo de tokens y
la latencia. En su lugar, el pipeline se modela como un **StateGraph determinista** donde la IA
participa _únicamente_ donde el código tradicional no puede resolver:

- **Deduplicación (0 tokens):** Hash SHA-256 del binario y consulta al puerto de caché.
- **Extracción de Visión:** Una única invocación estructurada al modelo con prompt acotado.
- **Validación de Esquema (0 tokens):** Zod y redacción de datos sensibles.
- **Enriquecimiento RAG:** Búsqueda semántica acotada en `pgvector` para productos/proveedores.
- **Persistencia en Caché (0 tokens):** Almacenamiento del documento procesado para futuros reintentos.

### 2. Desacople estricto de host

- Solo depende de `@synapse-vision/core`, `@langchain/langgraph`, `@langchain/core` y `zod`.
- **Prohibido importar** `@corebiz/*`, NestJS, Prisma, Next.js ni dependencias de BD directas.
- Verificado por la regla de arquitectura `synapse-vision-langchain-decoupled` en `dependency-cruiser`.

---

## Estructura

```
synapse-vision/langchain/src/
│
├── state.ts      ← Definición de canales y tipos del StateGraph (VisionGraphAnnotation)
├── nodes.ts      ← Funciones puras de los nodos del grafo (deduplication, extraction, validation, rag, cache)
├── graph.ts      ← Ensamblado del grafo y clase LangGraphVisionOrchestrator
└── index.ts      ← Exportaciones públicas del paquete
```
