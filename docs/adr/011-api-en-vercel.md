# ADR 011 — La API se despliega en Vercel, no en Render

**Estado:** aceptada · **Fecha:** 2026-09-14
**Supersede parcialmente:** [ADR 009](009-api-dedicada-en-nestjs.md), solo en **dónde** corre la API

## Contexto

ADR 009 añadió `apps/api` y la desplegó en el plan gratuito de Render, porque Vercel no
aloja procesos de larga vida. Eso dejaba tres plataformas (Vercel, Render y Supabase) y un
coste que ADR 009 asumía de forma explícita: Render duerme el servicio a los 15 minutos y
tarda cerca de **un minuto** en despertar. Justo el primer visitante del día, que suele ser
quien abre el enlace del currículum, se encontraba la pantalla de espera.

Al llegar el momento de desplegar se decidió reducirlo a dos cuentas: **Vercel y Supabase**.

## Decisión

**La API sigue siendo NestJS y sigue siendo un despliegue aparte.** Se publica como un
segundo proyecto de Vercel (`corebiz-api`, con raíz en `apps/api`) que ejecuta la aplicación
Nest dentro de una función.

- `src/bootstrap.ts` construye la aplicación sin escuchar en ningún puerto. La usan los dos
  puntos de entrada, así que lo que arrancan los tests es lo que se despliega.
- `src/main.ts` sigue siendo el proceso de larga vida: desarrollo, CI y la suite E2E.
- `src/serverless.ts` monta la aplicación **una vez por instancia** y la reutiliza en cada
  invocación. Si el arranque falla, lo olvida en lugar de cachear el error.
- `api/index.js` es **JavaScript a propósito**. Solo carga lo que `tsc` + `tsc-alias` ya
  compilaron. Un `.ts` ahí lo compilaría la herramienta de Vercel, que no emite metadatos de
  decorador ni reescribe los `require` de `@corebiz/*`.

Lo que **no** cambia:

1. El núcleo, los controllers y los tests. Ni un escenario Gherkin ni un spec se tocan.
2. `apps/web` **sigue sin `DATABASE_URL`**. Son dos proyectos de Vercel con variables
   distintas, no uno. Montar Nest dentro de una ruta de Next habría juntado las dos
   superficies y borrado la prueba observable de la separación.
3. El build de la API (`tsc` + `tsc-alias`, CommonJS, `emitDecoratorMetadata` apagado).

## Consecuencias

**Lo que se gana.** Dos cuentas en lugar de tres, y un arranque en frío de segundos en
lugar de un minuto. `/waking-up` se queda como red de seguridad y ya no es el camino normal.

**Lo que se paga:**

- **Pool por instancia.** Con Fluid compute una instancia atiende peticiones concurrentes,
  así que `DATABASE_MAX_CONNECTIONS` pasa de 10 (un proceso) a **3**, y el pooler de Supabase
  en modo transacción reparte entre instancias.
- **Cada pantalla gasta invocaciones en los dos proyectos.** Cuentan contra la misma cuota
  del plan Hobby.
- **Un límite de duración.** La función de la API tiene `maxDuration: 60`, que es lo que
  necesita clonar la base de demostración.
- **Acoplamiento a Vercel: dos ficheros**, `serverless.ts` y `vercel.json`. `main.ts` sigue
  arrancando la API en cualquier sitio que ejecute Node.

## Alternativas descartadas

- **Seguir en Render.** Sin cambios de código, pero con tres cuentas y el minuto de espera
  delante del primer visitante.
- **Nest dentro de una ruta de Next** (`app/api/[...path]`). Un solo proyecto, pero la web
  tendría acceso a la base de datos y ADR 009 dejaría de ser verdad en la parte que se puede
  comprobar.
- **El soporte automático de NestJS de Vercel.** Compila con su propia cadena, sin
  `tsc-alias` ni metadatos de decorador: es exactamente el fallo que ADR 009 documenta, en
  el que el build sale verde y el binario revienta al arrancar.
