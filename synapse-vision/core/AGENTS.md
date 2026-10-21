# Synapse Vision — Lectura de documentos con IA, agnóstica de host

> **Leer antes de tocar cualquier archivo de este paquete.**
> Este documento es el contrato de diseño de Synapse Vision. Las IAs que trabajen en este
> repositorio **deben** leerlo para entender qué es, qué no es, y cómo debe evolucionar.

---

## ¿Qué es Synapse Vision?

Synapse Vision es una **capacidad de lectura estructurada de documentos**, tecnológicamente
agnóstica. Recibe una imagen (una foto o un escaneo) de un documento de recepción —una **nota
de entrega**, una remisión, un comprobante— y devuelve sus datos **validados** como
estructura tipada, lista para que el host decida qué hacer con ellos.

- NO es una feature de CoreBiz.
- NO depende de Next.js, NestJS, Prisma, Supabase, ni de ningún proveedor de IA concreto.
- ES un paquete autónomo (`@synapse-vision/core`) adoptable por cualquier sistema:
  un backend en **Laravel, Spring Boot, FastAPI, Django, Rails**, o un frontend en
  **React, Vue, Angular, Svelte**.

> **CoreBiz emite NOTAS DE ENTREGA, no documentos fiscales.** El vocabulario de este
> paquete no incluye términos tributarios: se habla de documento de recepción, nota de
> entrega o remisión. El guardián `scripts/check-non-fiscal.sh` lo verifica en CI.

---

## Filosofía de diseño — Reglas Absolutas

Estas reglas **nunca se rompen**. Si una mejora las viola, la mejora está mal diseñada.

### 1. Cero dependencias de host

El paquete `synapse-vision/core/` solo puede depender de:

- `zod` (validación de esquemas)
- TypeScript puro

**Prohibido importar** desde `@corebiz/application`, `@corebiz/db`, `@corebiz/domain`,
`@corebiz/synapse`, NestJS, Next.js, Prisma, Supabase, o cualquier paquete del monorepo.

> **Razón:** un equipo en Laravel o Python debe poder copiar este paquete a su repo y
> entender el contrato sin conocer CoreBiz. La regla `synapse-vision-is-pure` de
> `dependency-cruiser` lo verifica: romperla rompe el build.

### 2. El negocio vive en el puente (Bridge)

Synapse Vision se comunica con el host por dos puertos (`VisionBridgePort`,
`VisionModelPort`). Todo lo específico del negocio —resolver un producto por su
descripción, emparejar un proveedor, verificar permisos— vive en la implementación del
puente. El paquete **nunca** llama a una base de datos.

### 3. Doble modo siempre disponible

Synapse Vision **siempre responde**, con o sin IA configurada:

| Condición                                   | Modo activado                           |
| ------------------------------------------- | --------------------------------------- |
| El host ofrece conexión y `VisionModelPort` | `'model'` — extracción real por IA      |
| No hay conexión o modelo                    | `'demo'` — documento y datos de ejemplo |

**Nunca** se devuelve un error al visitante por "no hay IA". El modo demo es el fallback y
es lo que hace que una instalación de producción sin proveedor configurado pueda **mostrar
la capacidad funcionando**: un documento de ejemplo descargable, el escaneo simulado y los
datos extraídos.

### 4. Zero-data y validación estricta

- La extracción del modelo es **entrada no confiable**: se valida contra un esquema Zod
  antes de salir del paquete. Si no valida, es un error, no una suposición.
- El paquete **NO inventa** saldos, precios ni datos que no vengan del documento o del host.

### 5. Aislamiento de rol

El `VisionActorContext` es de solo lectura y lo provee el host. El puente decide qué puede
leer o ingerir cada actor. Synapse Vision no eleva permisos.

---

## Arquitectura interna

```
synapse-vision/core/src/
│
├── types.ts          ← Tipos y constantes públicas (modos, actor, conexión, errores)
├── documents.ts      ← Esquemas Zod de la extracción (documento de recepción)
├── ports.ts          ← Contratos que el host implementa (Bridge) y el adaptador de modelo
├── contracts.ts      ← Contrato de transporte HTTP (petición/respuesta) para la vista
├── prompt.ts         ← Construye el prompt de extracción estructurada
├── demo.ts           ← Documento de ejemplo + extracción de ejemplo (modo demo)
├── demo-pdf.ts       ← Generador de PDF mínimo, sin dependencias (ASCII determinista)
├── security.ts       ← Sanitización / redacción de datos sensibles
├── orchestrator.ts   ← Cerebro: decide modo model o demo, valida y devuelve
└── index.ts          ← API pública del paquete
```

### Flujo de una lectura

```
Imagen (base64)
      │
      ▼
VisionOrchestrator.extract(actor, connection, image)
      │
      ├─ ¿Hay conexión válida y VisionModelPort? ──► prompt → port.extract() → Zod → { mode: 'model' }
      │
      └─ No hay IA ────────────────────────────────► demo()          → { mode: 'demo' }
```

---

## Cómo agregar un formato de documento

1. Define su esquema en `documents.ts` con Zod y exporta el tipo inferido.
2. Añade el caso al discriminador de `security.ts` / `contracts.ts` si viaja por HTTP.
3. Añade la variante de ejemplo en `demo.ts` si quieres que el modo demo la muestre.
4. Tests en `vision.test.ts`, con dobles de los puertos. **Prohibido** importar `@corebiz/*`.

---

## Integración en otro sistema

El host debe:

1. **Implementar `VisionBridgePort`** — resolver productos por descripción, proveedores,
   y decidir permisos.
2. **Implementar `VisionModelPort`** (opcional) — hablar con el modelo de visión
   (Ollama, un servicio propio, etc.). Sin esto, el modo demo sigue disponible.
3. **Instanciar `VisionOrchestrator`** con ambas implementaciones.
4. **Llamar a `orchestrator.extract(actor, connection, image)`** y devolver el resultado.

La vista desacoplada (`@synapse-vision/ui`) consume el contrato de `contracts.ts`
por HTTP; el host solo tiene que exponer un endpoint compatible.
