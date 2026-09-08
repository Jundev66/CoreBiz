# ADR 009 — Una API dedicada en NestJS, y Next.js como cliente

**Estado:** aceptada · **Fecha:** 2026-09-08
**Supersede parcialmente:** [ADR 001](001-arquitectura-hexagonal.md), en su rechazo de NestJS

## Contexto

ADR 001 descartó NestJS con una frase que sigue siendo cierta:

> **NestJS con inyección por decoradores**: aporta el patrón a cambio de un framework
> pesado y de `reflect-metadata`. El composition root manual da lo mismo en unas 40 líneas.

Nada de eso ha cambiado. `apps/web/src/composition/container.ts` funciona, se lee entero de
una sentada y no tiene una sola línea de ceremonia. Técnicamente no hay ningún problema que
NestJS resuelva aquí.

Lo que ha cambiado es para qué existe este repositorio. CoreBiz es, además de un producto,
la carta de presentación de quien lo escribe, y **NestJS aparece en una parte grande de las
ofertas de backend en TypeScript**. Un sistema que demuestra arquitectura hexagonal, RLS
multi-tenant y una pirámide de tests completa, pero que no enseña el framework que pide la
oferta, se queda fuera de la criba antes de que nadie lea el código.

Esa es la razón, y conviene decirla tal cual. Disfrazarla de necesidad técnica —"escalar
horizontalmente", "desacoplar el frontend"— sería mentir sobre un sistema que un
entrevistador va a leer, y la mentira se nota justo en la conversación donde más caro sale.

## Decisión

**Se añade `apps/api`, una API REST en NestJS, y pasa a ser la única capa de entrega.**
`apps/web` deja de montar casos de uso y habla con ella por HTTP desde el servidor.

Tres cosas que esta decisión **no** cambia, y son las que hacían viable tomarla:

1. **`packages/domain` y `packages/application` no se tocan.** No saben que existe NestJS,
   igual que no sabían que existía Next. Es exactamente lo que ADR 001 compró.
2. **El aislamiento multi-tenant no se mueve.** `establishTenantContext` sigue ejecutándose
   dentro de la transacción, con `set_config(..., true)`. Las cuatro capas de ADR 005 siguen
   donde estaban.
3. **La sesión sigue en una cookie `httpOnly`.** El navegador no recibe el token; lo reenvía
   `apps/web` desde el servidor. ADR 006 sobrevive entero.

En otras palabras: se sustituye un adaptador primario por otro. Que eso sea posible sin
tocar el núcleo **es la demostración de que la arquitectura hexagonal de este proyecto es
real y no decorativa** — y esa demostración vale más, como material de entrevista, que el
framework que la provocó.

## Consecuencias

**Lo que se gana.** Una API documentada con OpenAPI, con sus guards, sus DTOs y su
inyección de dependencias. Y una prueba empírica de la tesis del proyecto: los 25 escenarios
Gherkin y los 58 specs E2E tienen que pasar **sin cambiar una línea** después de la
migración. Si alguno necesita cambiar, la capa de entrega llevaba lógica de negocio dentro.

**Lo que se paga, y no es poco:**

- **Un salto de red por petición.** Antes el caso de uso se invocaba en el mismo proceso.
- **Un arranque en frío.** El plan gratuito de Render duerme el servicio a los 15 minutos y
  tarda cerca de un minuto en despertar. Se acepta y se tapa con una pantalla de espera
  honesta; lo que no se hace es fingir que no pasa. Ver `docs/DEPLOY.md`.
- **Dos despliegues que mantener** en lugar de uno, y dos sitios donde repartir variables
  de entorno.
- **`reflect-metadata` y decoradores**, exactamente el coste que ADR 001 no quería pagar.

**Un detalle de construcción que no es un detalle.** Los paquetes del monorepo se consumen
como TypeScript en crudo (`exports` → `./src/index.ts`, imports sin extensión). Node no
sabe ejecutar eso, así que `apps/api` compila a **CommonJS** con `tsc` —que sí implementa
`emitDecoratorMetadata`, cosa que esbuild no hace— y `tsc-alias` reescribe los `require` de
`@corebiz/*` para que apunten al código compilado dentro de `dist/`. El job `api` de CI
arranca el binario y consulta `/health`: compilar no basta, porque la inyección de Nest se
resuelve al levantar y no al compilar.

## Alternativas descartadas

- **Dejarlo como estaba.** Es lo correcto desde el punto de vista del producto, y es lo que
  decía ADR 001. Se descarta por el motivo declarado arriba, que es de empleabilidad.
- **Una API en NestJS conviviendo con las Server Actions.** Menos trabajo y menos riesgo,
  pero deja el mismo caso de uso servido por dos puertas, y ninguna de las dos acaba siendo
  la de verdad. Un revisor lo lee como indecisión, que es peor que cualquiera de las dos
  opciones puras.
- **NestJS solo para tareas asíncronas** (la tasa de cambio, la purga de sandboxes).
  Técnicamente es lo más defendible —hay un hueco real ahí— pero en un currículum se lee
  como "un cron", no como "sé NestJS", y entonces no cumple el motivo por el que se hace.
- **Compilar los paquetes del monorepo a `dist/` con `exports` duales.** Es la solución de
  libro al problema de construcción, y obligaría a añadir un paso de build a los cinco
  paquetes, matar la recarga en caliente entre ellos y revisar `transpilePackages` de Next.
  Mucho más cambio, en los paquetes que esta migración precisamente no debía tocar.
