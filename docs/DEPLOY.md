# Despliegue

Guía para poner CoreBiz en producción con coste **$0**, usando **Vercel y Supabase**.

CoreBiz son **dos proyectos de Vercel** sobre el mismo repositorio: la interfaz (Next.js,
`apps/web`) y la API (NestJS, `apps/api`), con Postgres y Auth en Supabase. Por qué dos
procesos está en [ADR 009](adr/009-api-dedicada-en-nestjs.md); por qué los dos en Vercel, en
[ADR 011](adr/011-api-en-vercel.md). Lo que hay que saber aquí es que las variables se
reparten entre los dos proyectos y que **hay un secreto que tiene que ser el mismo en ambos**.

---

## Antes de empezar

Dos cuentas gratuitas, sin tarjeta:

| Servicio                         | Para qué                           | Nota importante                                                                                 |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| [GitHub](https://github.com)     | Repositorio y CI                   | **Público**. En privado, este CI (~10 min por push) agota los 2.000 min/mes en unos 200 pushes. |
| [Supabase](https://supabase.com) | Postgres, Auth                     | Región **us-east-1**, la misma que las funciones de Vercel (`iad1`).                            |
| [Vercel](https://vercel.com)     | La interfaz y la API (2 proyectos) | Plan Hobby: uso personal **no comercial**.                                                      |

### Secretos: dónde viven y dónde no

- Ningún secreto se escribe en el repositorio, en un issue ni en un chat. Se generan con
  `openssl rand -base64 32` y se pegan **directamente** en el panel o por stdin a
  `vercel env add NOMBRE production --sensitive`.
- La copia que haya que conservar (la contraseña de la base) va a un gestor de contraseñas,
  no a un fichero dentro del repositorio.
- Las variables se crean **solo en el entorno Production**. Los despliegues de preview —los
  de pull requests, también los de forks de un repositorio público— se quedan sin acceso a
  la base.
- `.vercel/` está en `.gitignore`: `vercel pull` escribe ahí las variables descargadas.

---

## 1. Repositorio

```bash
gh repo create corebiz --public --source=. --push
```

El repositorio es público a propósito: es lo que hace que el proyecto sirva como carta de
presentación, y ningún secreto vive en él (ver `.env.example`).

## 2. Supabase

1. Crea el proyecto en **us-east-1**. Anota la contraseña de base de datos en tu gestor:
   **no se puede recuperar**.
2. En **Connect**, copia las cadenas del pooler:
   - **Transaction pooler**, puerto `6543` → `DATABASE_URL` de la API
   - **Session pooler**, puerto `5432` → solo para aplicar extensiones y la semilla
3. En **Settings → API Keys**, copia la clave **anon / publishable**. Es pública por diseño:
   RLS es lo que protege los datos.

> La `service_role` / secret key **no se usa en este proyecto y no hay que copiarla**.
> Bypasea Row Level Security por completo, y todo lo que necesitaría —crear una empresa,
> aceptar una invitación, provisionar una demostración— entra por funciones
> `SECURITY DEFINER` acotadas.

### Ajustes de Auth obligatorios

Viven en el panel y el repositorio no los puede comprobar.

- **Authentication → Sessions**: caducidad del access token en **600 segundos**. La API
  verifica la firma **localmente** contra el JWKS, así que revocar una cuenta tarda lo que
  le quede de vida al token (ver `docs/THREAT_MODEL.md`). Revocar el acceso a una empresa
  sigue siendo inmediato.
- **Authentication → Sign In / Providers → Email**: confirmación de correo **activada**.
- **Authentication → Policies**: contraseña mínima de **8** y comprobación de contraseñas
  filtradas.
- **Authentication → Sign In / Providers**: inicio de sesión **anónimo desactivado**.
- **Altas cerradas**: desactiva «Allow new users to sign up» **y** pon `SIGNUP_ENABLED=false`
  en los dos proyectos de Vercel. La variable cierra la aplicación, no Supabase Auth.
- **Authentication → URL Configuration**: el dominio de la web en **Site URL** y en
  **Redirect URLs**. Sin esto, los enlaces de recuperación e invitación apuntan a `localhost`.

> Comprueba las claves asimétricas abriendo
> `https://TU-PROYECTO.supabase.co/auth/v1/.well-known/jwks.json`: debe devolver una clave
> `ES256`. Con el secreto HS256 compartido habría que dar a la API una clave capaz de
> **emitir** tokens.

> ⚠️ **No uses `supabase config push`.** `supabase/config.toml` es la configuración
> **local** (Site URL en localhost, sin confirmación de correo, tokens de una hora) y la
> subiría tal cual.

## 3. Extensiones y esquema

Con la cadena del **session pooler**, en el editor SQL o con `psql`:

```sql
-- Purga de sandboxes cada 10 minutos, DENTRO de Postgres.
create extension if not exists pg_cron;

-- `with schema extensions` no es opcional: todas las funciones llevan `set search_path = ''`
-- y las invocan por su nombre completo (`extensions.crypt(...)`).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
```

Aplica las migraciones:

```bash
pnpm exec supabase link --project-ref TU_REF
pnpm exec supabase db push
```

Si falta una extensión, una migración lo comprueba y falla nombrándola.

### Sembrar la demostración

`supabase db push` **no** ejecuta la semilla. Sin ella no existe el tenant plantilla y `/demo`
falla con `NOT_A_DEMO_TEMPLATE`. Ejecuta **solo** `supabase/seed.sql`:

```bash
psql "CADENA_DEL_SESSION_POOLER" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

> ⚠️ **Nunca `supabase/seed.local.sql`**, y por eso tampoco `supabase db push --include-seed`:
> `config.toml` siembra los dos ficheros, y el local le da a la cuenta de la plantilla una
> contraseña publicada en el repositorio.

> ⚠️ **Nunca `supabase db reset --linked`.** Borra la base de producción entera.

Lo que deja `seed.sql` en producción es seguro con el repositorio público: la cuenta
`demo@corebiz.local` tiene una contraseña aleatoria que nadie conoce y ninguna identidad de
correo, y la plantilla queda **bloqueada en la base** (`demo_template_locked`).

## 4. Vercel — la API (`corebiz-api`)

1. **Add New → Project**, importa el repositorio y pon **Root Directory = `apps/api`**. El
   resto lo dice `apps/api/vercel.json`: sin framework, `pnpm build` (`tsc` + `tsc-alias`),
   todas las rutas hacia la función `api/index.js`, región `iad1` y 60 s de duración.
2. Variables de entorno, **solo Production**:

| Variable                      | Valor                                                           | Sensible |
| ----------------------------- | --------------------------------------------------------------- | -------- |
| `NODE_ENV`                    | `production`                                                    | —        |
| `DATA_DRIVER`                 | `postgres`                                                      | —        |
| `DATABASE_URL`                | transaction pooler, puerto 6543                                 | ✅       |
| `DATABASE_MAX_CONNECTIONS`    | `3`                                                             | —        |
| `DATABASE_CA_CERT`            | CA raíz de Supabase en PEM (pública; Settings → Database → SSL) | —        |
| `SUPABASE_URL`                | `https://TU-PROYECTO.supabase.co`                               | —        |
| `INTERNAL_API_SECRET`         | `openssl rand -base64 32`                                       | ✅       |
| `SIGNUP_ENABLED`              | `false`                                                         | —        |
| `DEMO_ENABLED`                | `true`                                                          | —        |
| `DEMO_TTL_HOURS`              | `24`                                                            | —        |
| `DEMO_MAX_CONCURRENT`         | `50`                                                            | —        |
| `DEMO_MAX_PER_HOUR`           | `3` (copias propias por red y hora)                             | —        |
| `DEMO_MAX_SANDBOXES_PER_HOUR` | `30` (copias por hora entre todos)                              | —        |

`DATABASE_MAX_CONNECTIONS` es **3** y no 1 ni 10: con Fluid compute una instancia atiende
peticiones concurrentes (con 1 esperarían en fila) y puede haber varias instancias (con 10
cada una se agotaría el pooler gratuito). `DOCS_ENABLED` **no se pone**: sin ella, el
OpenAPI no se publica.

`REQUEST_HASH_SECRET` **no va aquí**: la IP se hashea en la web, que es donde
`x-forwarded-for` es de fiar. A la API solo le llega el hash.

3. Comprueba:

```bash
curl https://corebiz-api.vercel.app/health
```

Debe responder `{"status":"ok","driver":"postgres","database":"reachable"}`. Si dice
`unreachable`, revisa `DATABASE_URL` y los registros de la función.

## 5. Vercel — la interfaz (`corebiz-web`)

1. **Add New → Project**, el mismo repositorio, **Root Directory = `apps/web`**, dejando
   marcado incluir archivos de fuera del directorio raíz. En la raíz del repositorio no hay
   dependencia de `next`, así que sin esto Vercel despliega un sitio estático vacío.
2. Variables de entorno, **solo Production**:

| Variable                        | Valor                                   | Sensible |
| ------------------------------- | --------------------------------------- | -------- |
| `API_BASE_URL`                  | `https://corebiz-api.vercel.app`        | —        |
| `INTERNAL_API_SECRET`           | **el mismo valor que en `corebiz-api`** | ✅       |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://TU-PROYECTO.supabase.co`       | —        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anon / publishable                | —        |
| `NEXT_PUBLIC_SITE_URL`          | `https://corebiz-web.vercel.app`        | —        |
| `CRON_SECRET`                   | `openssl rand -base64 32`               | ✅       |
| `REQUEST_HASH_SECRET`           | `openssl rand -base64 32`               | ✅       |
| `SIGNUP_ENABLED`                | `false`                                 | —        |
| `DEMO_ENABLED`                  | `true`                                  | —        |

**`DATABASE_URL` NO va aquí.** Que la interfaz no tenga acceso a la base de datos es la
prueba observable de que dejó de hablar con Postgres.

`REQUEST_HASH_SECRET` es **obligatorio**: sin él la web responde con error en vez de
arrancar con la sal de desarrollo, que está en el repositorio. Lo mismo con
`INTERNAL_API_SECRET`: si falta o no coincide con el de la API, el acceso se niega.

`CRON_SECRET` protege `/api/cron/purge`. Si falta, el endpoint responde 404 en lugar de
abrirse. Vercel lo manda solo en la cabecera `Authorization` de sus crons.

## 6. Mantener el proyecto vivo ⚠️

**Este paso no es opcional.** Supabase **pausa los proyectos gratuitos tras 7 días sin
actividad de base de datos**.

**a) Workflow de GitHub** (`.github/workflows/keepalive.yml`)

```bash
gh variable set APP_URL --body https://corebiz-web.vercel.app
gh workflow run keepalive.yml
```

**b) Monitor externo, también obligatorio**

GitHub **deshabilita los workflows programados tras 60 días sin commits**. Registra
`https://corebiz-web.vercel.app/api/health` en [cron-job.org](https://cron-job.org) o
[UptimeRobot](https://uptimerobot.com) cada 6 horas, con timeout de 60 s. Esa URL recorre la
cadena entera: web → API → Postgres.

## 7. Comprobar

```bash
# La cadena entera: la web pregunta a la API, y la API a Postgres.
curl https://corebiz-web.vercel.app/api/health

# La API por su cuenta, para saber cuál de las dos falla.
curl https://corebiz-api.vercel.app/health
```

Luego, a mano:

- [ ] La portada carga en menos de 2 s.
- [ ] `/demo` entrega una copia propia y el listado de clientes muestra datos.
- [ ] El aviso _"Documento no fiscal"_ está presente.
- [ ] El registro dice que las altas están cerradas y ofrece la demostración.
- [ ] Dos visitantes de la demo en dos navegadores no ven los datos del otro, ni forzando ids.
- [ ] **Con el token de uno, llamar a la API directamente tampoco alcanza los datos del otro.**
- [ ] `https://corebiz-api.vercel.app/docs` y `/docs-json` responden **404**.
- [ ] `/internal/cron/purge` sin el secreto responde **404**.
- [ ] Ni el HTML ni el JavaScript servidos contienen `INTERNAL_API_SECRET`, `DATABASE_URL`
      ni `postgres://`.
- [ ] El workflow de keepalive se ejecuta correctamente.

---

## Qué vigilar después

| Métrica                    | Dónde                                                         | Umbral        |
| -------------------------- | ------------------------------------------------------------- | ------------- |
| Tamaño de la base de datos | Supabase → Database                                           | 350 MB de 500 |
| Egress                     | Supabase → Usage                                              | 4 GB de 5     |
| Uso de funciones           | Vercel → Usage, en **los dos** proyectos                      | 80 % del plan |
| Sandboxes activos          | `select count(*) from demo_sessions where expires_at > now()` | 50            |

El circuit breaker degrada la aplicación antes de llegar al límite: deja de crear sandboxes y
sirve una demo compartida de solo lectura.

## Si algún día quisieras cobrar por esto

El plan Hobby de Vercel prohíbe el uso comercial. La migración sería **Vercel Pro** y
**Supabase Pro**, sin tocar código. Lo acoplado a Vercel es `next.config.ts`,
`apps/api/src/serverless.ts` y los `vercel.json`; `apps/api/src/main.ts` arranca la API como
proceso Node en cualquier sitio, y las tareas programadas viven en `pg_cron`.
