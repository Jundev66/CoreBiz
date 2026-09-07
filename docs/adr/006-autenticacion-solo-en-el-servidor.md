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
