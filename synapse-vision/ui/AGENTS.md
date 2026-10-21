# Synapse Vision UI — la vista desacoplada

> **Leer antes de tocar cualquier archivo de este paquete.**

Este paquete es la **vista** de Synapse Vision: un componente React que sube una imagen de un
documento de recepción, la manda a un host por HTTP y muestra la extracción validada. Está
separado del backend a propósito, para que cualquiera de los dos pueda moverse a otro sistema
sin arrastrar al otro.

## Reglas

### 1. Sólo habla el contrato, nunca un host concreto

La vista consume `VisionTransport`, que devuelve `VisionExtractResponse`. No importa nada de
CoreBiz, ni de Next.js, ni conoce rutas ni sesiones. El host inyecta la implementación (por
ejemplo, un `fetch` a su endpoint). Romper esto rompe la regla `synapse-vision-ui-decoupled`
de `dependency-cruiser`.

### 2. Las dependencias son las mínimas

- `@synapse-vision/core` (los tipos y esquemas del contrato, también agnóstico)
- `react` (peer dependency: lo pone el host)

Nada más. Prohibido importar cualquier otro `@corebiz/*`, `next`, `@prisma/client`, etc.

### 3. La lógica testeable vive fuera de React

`machine.ts` es un reductor puro (sin React) y `transport.ts` no sabe de componentes. Los
tests corren en Node sin montar nada. El componente es delgado: traduce eventos a acciones.

## Piezas

```
src/
├── machine.ts           ← Reductor puro: idle | scanning | ready | error
├── transport.ts         ← Interfaz VisionTransport + adaptador fetch opcional
├── use-vision.ts        ← Hook: conecta el reductor con el transporte
├── vision-assistant.tsx ← Componente React (props: transport, título, className…)
└── index.ts             ← API pública
```

## Integración en un host

```tsx
import { VisionAssistant, createFetchVisionTransport } from '@synapse-vision/ui';

const transport = createFetchVisionTransport({
  endpoint: '/api/vision/extract',
  headers: () => ({ Authorization: `Bearer ${token}` }),
});

<VisionAssistant transport={transport} title="Leer nota de entrega" />;
```

El modo demo llega solo: si el host no tiene IA, su endpoint responde `{ mode: 'demo', ... }`
y la vista lo muestra igual, con el documento de ejemplo descargable.
