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
      ║ Función Node — Server Actions y RSC                 ║
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

| Amenaza                            | Mitigación                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Robo de sesión                     | Cookies `httpOnly`, `Secure`, `SameSite=Lax`. El JWT nunca toca `localStorage`.                            |
| Token falsificado                  | En el servidor se usa `getClaims()`, que **verifica la firma**; nunca `getSession()` para decidir accesos. |
| Enumeración de correos en el login | Respuesta genérica y de duración constante: no se distingue "no existe" de "contraseña incorrecta".        |
| Fuerza bruta                       | Rate limit por IP y por correo en el endpoint de acceso.                                                   |

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

| Amenaza                                                 | Mitigación                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Variable de tenant pegada a una conexión del pooler** | `set_config(..., true)` — local a la transacción. Con `false`, la variable sobreviviría a la petición y Supavisor reutilizaría esa conexión para **otro tenant**. Es la fuga más difícil de detectar del sistema, porque solo aparece bajo concurrencia. Hay un test que la cubre. |
| **Fuga de la clave `service_role`**                     | Bypasea RLS por completo. Cuarentena en un único módulo + regla de dependency-cruiser que rompe el build ante cualquier importación no autorizada + guarda en runtime + `gitleaks` en CI.                                                                                          |
| El propietario de la tabla salta sus políticas          | `FORCE ROW LEVEL SECURITY`, no solo `ENABLE`.                                                                                                                                                                                                                                      |
| **Escalada vía `SECURITY DEFINER`**                     | Todas las funciones llevan `set search_path = ''` y nombres completamente cualificados. Sin eso, quien pueda crear objetos en un esquema del `search_path` secuestra el nombre de una tabla.                                                                                       |
| Datos de un tenant servidos desde caché compartida      | El segmento de aplicación es `force-dynamic`. Verificado por un test E2E que comprueba la cabecera `Cache-Control`.                                                                                                                                                                |
| IDOR sobre documentos                                   | Identificadores UUID v7 y toda lectura acotada por tenant. Un id ajeno responde 404, no 403: un 403 confirmaría que el recurso existe.                                                                                                                                             |
| Archivos accesibles sin permiso                         | Todos los buckets de Storage privados, con URLs firmadas de vida corta.                                                                                                                                                                                                            |
| Reconocimiento del framework                            | `poweredByHeader: false`. No evita un ataque, pero no hay razón para regalar la versión.                                                                                                                                                                                           |

### D — Denegación de servicio

| Amenaza                                               | Mitigación                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agotar la cuota gratuita** (el riesgo más realista) | Circuit breaker global sobre tamaño de base de datos, sandboxes vivos e invocaciones estimadas. Al superar el umbral, la aplicación **degrada** en vez de caer.                                                                       |
| Granja de sandboxes de demostración                   | Provisión solo por `POST` con verificación de `Origin` — un `GET` nunca crea nada, así que rastreadores y previsualizaciones de enlace no consumen cuota. Más cookie que reutiliza el sandbox existente, límite por IP y tope global. |
| Escrituras masivas                                    | Cuotas de negocio aplicadas en el dominio, con respaldo en triggers de base de datos.                                                                                                                                                 |
| Consultas caras                                       | Paginación por keyset e índices que empiezan siempre por `tenant_id`. Sin `OFFSET`.                                                                                                                                                   |

### E — Elevación de privilegios

| Amenaza                                         | Mitigación                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rol elevado por manipulación del cliente        | El rol se lee de la pertenencia en base de datos, nunca del cliente. La autorización se comprueba en el **caso de uso**: ocultar un botón no es una medida de seguridad, porque la Server Action se puede invocar directamente. |
| Un administrador se auto-asciende a propietario | Políticas sobre `memberships` + trigger `enforce_last_owner`.                                                                                                                                                                   |
| Módulos de pago accesibles sin plan             | El gating se aplica en el caso de uso y en la capa de consulta, no solo en la ruta.                                                                                                                                             |

---

## 4. Riesgos aceptados

Decisiones conscientes, no descuidos:

| Riesgo                                        | Por qué se acepta                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sin autenticación de doble factor**         | Fuera del alcance de un proyecto de portafolio. Supabase Auth lo soporta; añadirlo sería configuración, no rediseño.                          |
| **Rate limit de ventana fija**, no deslizante | Permite un pico al cambiar de ventana. A esta escala es irrelevante y evita una dependencia externa.                                          |
| **Contador de invocaciones muestreado**       | Se estima con muestreo del 2 % en lugar de escribir en cada petición. Margen de error ~±5 %, suficiente para un disyuntor y mucho más barato. |
| **Sin cifrado a nivel de campo**              | El cifrado en reposo de Supabase cubre el modelo de amenazas de un ERP de comercio pequeño.                                                   |
| **Sin recuperación a un punto en el tiempo**  | El plan gratuito no la ofrece. Mitigado porque el entorno de demostración es reconstruible desde el seed versionado.                          |

---

## 5. Qué hacer si algo pasa

1. **Rotar claves** — `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` desde el panel de Supabase y las variables de Vercel.
2. **Cortar escritura** — poner `system_flags.mode` en `readonly`; la aplicación se sigue navegando pero no acepta cambios.
3. **Cerrar la demo** — `DEMO_ENABLED=false` detiene la provisión de sandboxes sin tocar el resto.
4. **Revisar el rastro** — `audit_log` filtrado por tenant y ventana temporal.
5. **Restaurar** — copias diarias con siete días de retención en el plan gratuito. **No hay recuperación a un punto exacto en el tiempo**: la pérdida máxima es de 24 horas.

---

## 6. Verificación continua

| Comprobación                                           | Dónde                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Aislamiento entre tenants, tabla por tabla             | Test de integración parametrizado. Añadir una tabla sin política **rompe el build**. |
| Variable de tenant no persiste entre transacciones     | Test de integración sobre la misma conexión con dos tenants distintos.               |
| La `service_role` no se importa fuera de su cuarentena | `pnpm arch` en CI                                                                    |
| Secretos commiteados                                   | `gitleaks` en CI                                                                     |
| Cabeceras de seguridad y caché                         | Test E2E                                                                             |
| Accesibilidad                                          | `axe-core` en E2E                                                                    |
| Vocabulario tributario en el producto                  | `scripts/check-non-fiscal.sh` en CI                                                  |
