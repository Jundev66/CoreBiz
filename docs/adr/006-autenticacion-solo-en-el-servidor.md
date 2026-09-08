# ADR 006 — Autenticación enteramente en el servidor

**Estado:** aceptada · **Fecha:** 2026-09-07

## Contexto

CoreBiz necesita sesiones reales. Supabase Auth ofrece dos caminos: el cliente de
navegador (`createBrowserClient`), que es el que aparece en casi todos los tutoriales, y
el de servidor con `@supabase/ssr` sobre cookies.

El sistema guarda inventario, precios de compra y el historial de un negocio. Un XSS en
una aplicación así no es una molestia: es acceso a los datos de todos los clientes de esa
empresa.

## Decisión

**Toda la autenticación ocurre en el servidor.** Los formularios son Server Actions, la
sesión vive en cookies `httpOnly` `Secure` `SameSite=Lax`, y al navegador no llega ni el
SDK ni el token.

Se usa `getUser()` y nunca `getSession()` para decidir accesos. La diferencia importa:
`getSession()` lee la cookie y decodifica el token **sin verificar la firma**, así que una
cookie fabricada a mano pasaría por sesión válida. `getUser()` la verifica contra el
servidor de autenticación. Es un viaje de red más por request, y es el precio correcto en
el único punto del sistema donde se decide quién es alguien.

## Consecuencias

**Lo que se gana.** El token vive en una cookie `httpOnly`: inalcanzable para cualquier
script que llegue a ejecutarse en la página. Un XSS pasa de total a molesto. Además, los
formularios de acceso funcionan **sin JavaScript** — degradan a un POST normal, que en un
móvil con mala conexión es la diferencia entre poder entrar o no.

**Lo que se paga, a conciencia.** No hay refresco de sesión en segundo plano ni eventos de
`onAuthStateChange`. Para un ERP que se navega por páginas completas no hacen falta: el
middleware renueva el token en cada request. Una aplicación con un panel en tiempo real
sí los echaría de menos.

`SameSite=Lax` y no `Strict`: con `Strict`, volver desde el enlace del correo de
recuperación llegaría sin sesión y el flujo se rompe justo donde menos se entiende. `Lax`
sigue bloqueando el envío en peticiones cruzadas de escritura, que es donde está el CSRF.

## Alternativas descartadas

**Cliente de navegador con el token en memoria o `localStorage`.** Es el camino de la
documentación oficial y el que hace falta para una SPA. Aquí no hay SPA, y el token
tendría que ser legible por JavaScript por definición.

**JWT propio con sesiones en base de datos.** Más control y más superficie que mantener:
rotación, revocación, expiración. Supabase Auth ya lo hace y está auditado.

---

## Addendum (2026-09-08) — el token cruza una frontera de servicio

Con la migración a una API dedicada ([ADR 009](009-api-dedicada-en-nestjs.md)) el token
deja de consumirse donde se guarda. Lo que **no** cambia, que es lo que esta ADR
protegía: sigue viviendo en una cookie `httpOnly` y **al navegador no llega nunca**. Lo
reenvía `apps/web` desde el servidor, en una llamada servidor a servidor.

Dos consecuencias que conviene tener escritas, porque las dos se van a "arreglar" en la
dirección equivocada si no lo están:

**1. En `apps/web` se usa `getSession()`, y es correcto.** Esta ADR prohíbe
`getSession()` para _decidir_ accesos, porque decodifica sin comprobar la firma. Al
sacar el token para reenviarlo no se decide nada — y `getUser()` ni siquiera devuelve el
access token, así que no habría alternativa. La regla que sigue viva: **en `apps/web`
nada se decide a partir de esa llamada.**

**2. La API verifica la firma localmente, contra el JWKS del proyecto.** Es verificación
criptográfica real, que es lo que esta ADR exigía; lo que no hace es preguntárselo a
Supabase en cada petición. Se ahorra un viaje de red por request, sobre un salto de red
que ya existe y que además puede estar despertando.

**Lo que se paga, dicho sin adornos:** revocar una _cuenta_ deja de ser inmediato y pasa
a tardar lo que le quede de vida al token. Por eso el TTL baja a **10 minutos**, y ese
ajuste es parte de la decisión y no un extra — está en `docs/DEPLOY.md` como paso
obligatorio. Revocar un _acceso a una empresa_ sigue siendo inmediato: el contexto
consulta las pertenencias en cada petición, y sin fila no hay acceso.

**Lo que NO se abre:** CORS. Nada en el navegador llama a la API. El día que hiciera
falta abrirlo, la pregunta correcta no sería qué origen permitir, sino por qué el token
ha llegado al navegador.
