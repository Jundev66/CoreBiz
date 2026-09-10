# Modelo de amenazas — CoreBiz

Análisis STRIDE del sistema, con las mitigaciones implementadas y los riesgos aceptados
de forma consciente. Este documento se actualiza cuando cambia la superficie de ataque,
no cuando ocurre un incidente.

> El código de CoreBiz es **público**. Eso es deliberado: la seguridad del sistema no
> depende de que nadie lo lea. Si esconder el código fuese necesario para que el
> aislamiento entre empresas aguantase, el aislamiento no sería tal.

---

## 1. Activos que se protegen

| Activo                       | Por qué importa                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Datos de cada empresa        | Clientes, precios de compra y venta, márgenes, inventario. Que un comercio vea los precios de otro es el fin del producto. |
| Credenciales y sesiones      | Un secuestro de sesión da acceso completo al tenant.                                                                       |
| Registro de auditoría        | Si se puede editar, deja de servir para lo único que existe.                                                               |
| **Cuota de infraestructura** | El presupuesto es $0. Agotar la cuota gratuita tumba el sitio, y un enlace de CV caído es el peor fallo posible aquí.      |

## 2. Fronteras de confianza

```
  Navegador  ──┐  nada de aquí es de fiar
               │
      ╔════════▼═══════════════════════════════════════════╗
      ║ Vercel Edge — middleware, CSP, rate limit           ║
      ╚════════┬═══════════════════════════════════════════╝
               │
      ╔════════▼═══════════════════════════════════════════╗
      ║ Vercel · Función Node — Next.js                     ║
      ║   SOLO transporte. No decide nada, no toca la base. ║
      ║   Reenvía el token; nunca se lo da al navegador.    ║
      ╚════════┬═══════════════════════════════════════════╝
               │  HTTPS servidor a servidor, Bearer + hash de IP
               │  ── FRONTERA DE CONFIANZA NUEVA ──
      ╔════════▼═══════════════════════════════════════════╗
      ║ Render · NestJS — la API                            ║
      ║   Verifica la firma  →  resuelve el tenant          ║
      ║   Zod valida  →  caso de uso decide  →  dominio     ║
      ╚════════┬═══════════════════════════════════════════╝
               │  transacción con app.tenant_id fijado
      ╔════════▼═══════════════════════════════════════════╗
      ║ Supavisor (pooler) → PostgreSQL con RLS forzada     ║
      ╚════════════════════════════════════════════════════╝
```

---

## 3. Análisis STRIDE

### S — Suplantación de identidad

| Amenaza                              | Mitigación                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robo de sesión                       | Cookies `httpOnly`, `Secure`, `SameSite=Lax`. El JWT nunca toca `localStorage`.                                                                                                                                                                                                                                                                                                       |
| Token falsificado                    | La API **verifica la firma criptográficamente** contra el JWKS del proyecto (ES256). Nunca se decodifica sin verificar. En `apps/web` se usa `getSession()` para SACAR el token y reenviarlo —no para decidir nada— y esa distinción está escrita en el archivo y en ADR 006, porque el siguiente lector la va a "arreglar" en una dirección o en la otra.                            |
| Suplantación entre los dos servicios | La API no se fía de nada que le llegue por cabecera: el rol sale de la pertenencia leída de la base y las cabeceras de demostración solo se obedecen dentro de un tenant `is_demo` **y** siendo ya propietario, así que solo pueden quitar permisos. Los endpoints internos van tras un secreto compartido comparado en tiempo constante, y responden **404** si no está configurado. |
| Enumeración de correos en el login   | Un único mensaje para "no existe" y "contraseña incorrecta", en acceso y en recuperación. La recuperación responde "enviado" siempre, incluso con una dirección sin cuenta.                                                                                                                                                                                                           |
| Fuerza bruta                         | Límite por **hash de IP**, no por correo: contar por correo permitiría dejar fuera a una persona concreta gastándole los intentos, y convertiría la respuesta en un oráculo sobre qué direcciones existen. UPSERT atómico en Postgres — un contador en memoria de proceso no limita nada en serverless.                                                                               |

### T — Manipulación de datos

| Amenaza                                                   | Mitigación                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Salto de tenant** manipulando el slug o un id en la URL | RLS + comprobación de pertenencia + filtrado explícito en el repositorio. Cuatro capas, ver ADR 005.                                                      |
| Mover una fila propia al tenant de otro                   | `WITH CHECK` en las políticas de `UPDATE`. Solo con `USING`, esa escritura pasaría.                                                                       |
| Mass assignment por campos colados en el cuerpo           | Los comandos extraen **solo los campos declarados**; lo que no está en la lista no llega al dominio.                                                      |
| Edición del registro de auditoría                         | `UPDATE` y `DELETE` **revocados por GRANT**, no solo por política: una política se sustituye con un `create policy` posterior, un privilegio revocado no. |
| Borrado de documentos                                     | Política de `DELETE` en `false`. Los documentos se anulan, nunca se borran.                                                                               |
| CSRF                                                      | Next valida el `Origin` de las Server Actions. Cookies `SameSite=Lax`.                                                                                    |

### R — Repudio

| Amenaza                                  | Mitigación                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Yo no emití esa nota"                   | Registro de auditoría inmutable con actor, acción, entidad y marca temporal, escrito **en la misma transacción** que el cambio. Si la auditoría falla, el cambio se deshace. |
| Inventario que no cuadra sin explicación | El stock es el saldo de movimientos registrados, no un campo que se fija. Los ajustes exigen motivo.                                                                         |

### I — Divulgación de información

| Amenaza                                                 | Mitigación                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Variable de tenant pegada a una conexión del pooler** | `set_config(..., true)` — local a la transacción. Con `false`, la variable sobreviviría a la petición y Supavisor reutilizaría esa conexión para **otro tenant**. Es la fuga más difícil de detectar del sistema, porque solo aparece bajo concurrencia. Hay un test que la cubre.                                                                                                            |
| **Fuga de la clave `service_role`**                     | **No existe en el despliegue.** Es la única mitigación que no puede fallar: lo que la clave permitiría —crear una empresa, aceptar una invitación, provisionar una demostración— entra por funciones `SECURITY DEFINER` acotadas y revocadas de `public`. Una llave maestra guardada por si acaso acaba filtrándose; la que no se guarda, no.                                                 |
| El propietario de la tabla salta sus políticas          | `FORCE ROW LEVEL SECURITY`, no solo `ENABLE`.                                                                                                                                                                                                                                                                                                                                                 |
| **Escalada vía `SECURITY DEFINER`**                     | Todas las funciones llevan `set search_path = ''` y nombres completamente cualificados. Sin eso, quien pueda crear objetos en un esquema del `search_path` secuestra el nombre de una tabla.                                                                                                                                                                                                  |
| Datos de un tenant servidos desde caché compartida      | Toda pantalla con datos lee cookies y pide a la API con `cache: 'no-store'`, así que Next la trata como dinámica; `staleTimes.dynamic` está en 0. Verificado por un test E2E que comprueba la cabecera `Cache-Control`. **No se declara `force-dynamic` en el segmento**: el efecto es el mismo y la garantía es más débil, porque depende de que nadie deje de leer cookies en una pantalla. |
| IDOR sobre documentos                                   | Identificadores UUID v7 y toda lectura acotada por tenant. Un id ajeno responde 404, no 403: un 403 confirmaría que el recurso existe.                                                                                                                                                                                                                                                        |
| Archivos accesibles sin permiso                         | **No aplica: el sistema no almacena archivos.** No hay adjuntos ni Supabase Storage. Se deja la fila para que la ausencia sea deliberada y no un olvido.                                                                                                                                                                                                                                      |
| Reconocimiento del framework                            | `poweredByHeader: false`. No evita un ataque, pero no hay razón para regalar la versión.                                                                                                                                                                                                                                                                                                      |
| **Script inyectado que se ejecuta** (XSS)               | CSP con **nonce distinto por petición** y `strict-dynamic`, que descarta las listas de dominios y confía solo en el nonce. Como toda la autenticación es de servidor, el token de sesión vive en una cookie `httpOnly` y un XSS no llega a él.                                                                                                                                                |
| Enmarcado de la aplicación en un sitio ajeno            | `frame-ancestors 'none'` y `X-Frame-Options: DENY`.                                                                                                                                                                                                                                                                                                                                           |
| Reescritura del destino de los formularios              | `base-uri 'none'` y `form-action 'self'`. Sin la primera, un `<base>` inyectado redirige **toda** URL relativa de la página, envíos con credenciales incluidos.                                                                                                                                                                                                                               |

### D — Denegación de servicio

| Amenaza                                               | Mitigación                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agotar la cuota gratuita** (el riesgo más realista) | Circuit breaker sobre **tamaño de base de datos y sandboxes vivos** (umbrales 0,70 y 0,85 sobre 500 MB). Al superarlos, **la demostración** degrada a solo lectura en vez de rechazar al visitante; falla cerrado si no puede leer el tamaño. **Protege el aprovisionamiento de demos, no la aplicación entera**, y la API no tiene limitador propio: ver «Pendiente». |
| Granja de sandboxes de demostración                   | Provisión solo por `POST` con verificación de `Origin` — un `GET` nunca crea nada, así que rastreadores y previsualizaciones de enlace no consumen cuota. Más cookie que reutiliza el sandbox existente, límite por IP y tope global.                                                                                                                                  |
| Escrituras masivas                                    | **Sin mitigación hoy.** Hubo cuotas por recurso aplicadas en el dominio; al abrir el producto se quedaron sin techo. La maquinaria sigue en `packages/domain/src/billing/plan.ts` y reponer un límite es escribir otra definición. Ver «Pendiente».                                                                                                                    |
| Consultas caras                                       | Índices que empiezan siempre por `tenant_id`, y paginación por keyset **en clientes y proveedores**. Productos, notas de entrega y recepciones sirven un `LIMIT` fijo. Sin `OFFSET` en ninguno.                                                                                                                                                                        |

### E — Elevación de privilegios

| Amenaza                                         | Mitigación                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rol elevado por manipulación del cliente        | El rol se lee de la pertenencia en base de datos, nunca del cliente. La autorización se comprueba en el **caso de uso**: ocultar un botón no es una medida de seguridad, porque la Server Action se puede invocar directamente.                                                                                                                                                                                    |
| Un administrador se auto-asciende a propietario | Políticas sobre `memberships` + trigger `enforce_last_owner`.                                                                                                                                                                                                                                                                                                                                                      |
| Módulos de pago accesibles sin plan             | En las ESCRITURAS lo decide el caso de uso. En las LECTURAS no hay caso de uso por el que pasar —son consultas planas— así que lo decide un guard de la API: `FeatureGuard`. Hasta que existió, la migración dejó `GET /v1/reports/sales-summary` abierto al plan gratuito. No era una fuga de datos —RLS seguía confinando cada petición a la empresa propia— pero sí una barrera de monetización que se saltaba. |

---

## 4. Riesgos aceptados

Decisiones conscientes, no descuidos:

| Riesgo                                        | Por qué se acepta                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sin autenticación de doble factor**         | Fuera del alcance de un proyecto de portafolio. Supabase Auth lo soporta; añadirlo sería configuración, no rediseño.                                                                                                                                                               |
| **Rate limit de ventana fija**, no deslizante | Permite un pico al cambiar de ventana. A esta escala es irrelevante y evita una dependencia externa.                                                                                                                                                                               |
| **La demostración se sirve sin sesión**       | Es el motivo de que el proyecto tenga un enlace visitable. Está acotado: solo se sirve un tenant cuya fila está marcada `is_demo`, así que apuntar la constante a una empresa real **no la expone** — redirige a la pantalla de acceso. Se cierra entero con `DEMO_ENABLED=false`. |
| **Sin cifrado a nivel de campo**              | El cifrado en reposo de Supabase cubre el modelo de amenazas de un ERP de comercio pequeño.                                                                                                                                                                                        |
| **Sin recuperación a un punto en el tiempo**  | El plan gratuito no la ofrece. Mitigado porque el entorno de demostración es reconstruible desde el seed versionado.                                                                                                                                                               |

---

## 5. Pendiente — lo que este documento NO puede afirmar todavía

Esta sección existe porque un modelo de amenazas que afirma de más es peor que uno corto:
quien encuentre una mitigación inexistente deja de creerse las que sí están. Lo de aquí
abajo son huecos conocidos, no descuidos.

| Hueco                                             | Estado real                                                                                                                                     | Por qué importa                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La API pública no tiene limitador propio**      | El limitador vive en la interfaz y solo cubre el acceso. Con un token válido se puede martillear `GET /v1/products` sin freno.                  | RLS confina cada petición a su empresa, así que **no es fuga**; es el vector directo contra el activo que este documento declara prioritario, la cuota de infraestructura. |
| **Sin observabilidad**                            | Sin Sentry, sin logs estructurados, sin identificador de petición ni de empresa en el registro. Los errores van a la salida estándar de Render. | Un error inesperado en producción **es invisible**: nadie se entera salvo que esté mirando la consola en ese momento.                                                      |
| **Sin pantallas de error propias**                | No hay `error.tsx`, `global-error.tsx` ni `not-found.tsx`.                                                                                      | Un fallo de la API muestra la pantalla genérica de Next, que es exactamente el peor resultado descrito en la sección de verificación.                                      |
| **Sin interruptor de solo lectura**               | `system_flags` solo la lee el aprovisionador de demos.                                                                                          | El paso 2 del procedimiento de incidentes no funciona hasta que se implemente.                                                                                             |
| **Sin cuotas de escritura**                       | Se retiraron al abrir el producto; la maquinaria del dominio sigue intacta.                                                                     | Es la mitigación que falta contra escrituras masivas.                                                                                                                      |
| **Sin distinción entre `liveness` y `readiness`** | `/health` devuelve 503 si la base va lenta.                                                                                                     | Render podría reiniciar o revertir un contenedor sano. Irrelevante a esta escala; se anota para no confundirlo con una decisión.                                           |

---

## 6. Qué hacer si algo pasa

1. **Rotar claves** — `CRON_SECRET` en Vercel, `REQUEST_HASH_SECRET` en Vercel, `INTERNAL_API_SECRET` **en las dos a la vez** (es el único compartido), y la contraseña de base de datos desde el panel de Supabase. No hay `service_role key` que rotar: este despliegue no usa ninguna.
2. **Cortar escritura** — hoy no hay interruptor. La tabla `system_flags` existe y **solo la lee el aprovisionador de demos**, así que ponerla en `readonly` no detiene las escrituras del producto. Lo que sí corta de inmediato es revocar los permisos de escritura del rol `authenticated` en Postgres. Ver «Pendiente».
3. **Cerrar la demo** — `DEMO_ENABLED=false` detiene la provisión de sandboxes sin tocar el resto.
4. **Revisar el rastro** — `audit_log` filtrado por tenant y ventana temporal.
5. **Restaurar** — copias diarias con siete días de retención en el plan gratuito. **No hay recuperación a un punto exacto en el tiempo**: la pérdida máxima es de 24 horas.

---

## 7. Verificación continua

| Comprobación                                             | Dónde                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Aislamiento entre tenants, tabla por tabla               | Test de integración parametrizado. Añadir una tabla sin política **rompe el build**.            |
| Variable de tenant no persiste entre transacciones       | Test de integración sobre la misma conexión con dos tenants distintos.                          |
| La interfaz no vuelve a importar la persistencia         | `pnpm arch` en CI, con la regla escrita para atrapar también el import **sin resolver**         |
| La interfaz no importa valores de `@corebiz/application` | `pnpm lint` en CI: puede conocer las formas, no ejecutar la lógica                              |
| Un controller no puede fabricarse un contexto de tenant  | `pnpm arch` en CI                                                                               |
| Dos identidades en el MISMO proceso no se mezclan        | Test de integración que levanta la API y le habla por HTTP con peticiones **alternadas**        |
| Secretos commiteados                                     | `gitleaks` en CI                                                                                |
| Cabeceras de seguridad, nonce por petición y caché       | Test E2E, incluida la comprobación de que **no se dispara ninguna violación de CSP** al navegar |
| El `WITH CHECK` impide mover una fila a otro tenant      | Test de integración                                                                             |
| `audit_log` no admite `UPDATE` ni `DELETE`               | Test de integración                                                                             |
| La conexión opera con un rol **sin** `BYPASSRLS`         | Test de integración: sin esto, toda la matriz seguiría verde con el aislamiento apagado         |
| Los roles de `app.can_write()` coinciden con el dominio  | Test de integración contra `pg_get_functiondef`                                                 |
| El limitador no pierde intentos concurrentes             | Test de integración con 20 peticiones simultáneas                                               |
| Una cuenta nueva no ve los datos de otra empresa         | Test E2E de punta a punta, con sesión y políticas reales                                        |
| Accesibilidad                                            | `axe-core` en E2E                                                                               |
| Vocabulario tributario en el producto                    | `scripts/check-non-fiscal.sh` en CI                                                             |
