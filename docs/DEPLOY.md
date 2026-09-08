# Despliegue

Guía para poner CoreBiz en producción con coste **$0**. Del repositorio vacío a una URL
viva en unos 30 minutos.

---

## Antes de empezar

Tres cuentas gratuitas, sin tarjeta:

| Servicio                         | Para qué                | Nota importante                                                                                 |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| [GitHub](https://github.com)     | Repositorio y CI        | **Público**. En privado, este CI (~10 min por push) agota los 2.000 min/mes en unos 200 pushes. |
| [Supabase](https://supabase.com) | Postgres, Auth, Storage | Crea el proyecto en la **misma región** que la función de Vercel.                               |
| [Vercel](https://vercel.com)     | Alojamiento             | Plan Hobby: uso personal **no comercial**.                                                      |

---

## 1. Repositorio

```bash
gh repo create corebiz --public --source=. --push
```

O crea el repositorio en la web y añade el remoto a mano. El repositorio es público a
propósito: es lo que hace que el proyecto sirva como carta de presentación, y ningún
secreto vive en él (ver `.env.example`).

## 2. Supabase

1. Crea el proyecto. Anota la contraseña de base de datos: **no se puede recuperar**.
2. Elige la región más cercana a tu público y recuérdala para el paso 4.
3. En **Settings → Database**, copia las dos cadenas de conexión:
   - **Transaction pooler**, puerto `6543` → `DATABASE_URL`
   - **Direct connection**, puerto `5432` → `DIRECT_URL`
4. En **Settings → API**, copia `URL` y `anon key`.

> La `service_role key` **no se usa en este proyecto y no hay que copiarla**. Bypasea Row
> Level Security por completo, y todo lo que necesitaría —crear una empresa, aceptar una
> invitación, provisionar una demostración— entra por funciones `SECURITY DEFINER`
> acotadas. Una clave capaz de saltarse el aislamiento entre empresas es la última que
> conviene tener dando vueltas por variables de entorno.

5. En **Authentication → URL Configuration**, pon el dominio de Vercel en **Site URL** y
   añádelo también a **Redirect URLs**. Sin esto, los enlaces de recuperación de
   contraseña y de invitación llegan apuntando a `localhost`.

Aplica el esquema:

```bash
pnpm dlx supabase link --project-ref TU_REF
pnpm dlx supabase db push
```

## 3. Extensiones de base de datos

En el editor SQL de Supabase:

```sql
-- Purga de sandboxes cada 10 minutos, DENTRO de Postgres.
-- Vercel Hobby solo admite crons diarios, así que esta tarea no puede vivir allí.
create extension if not exists pg_cron;

-- `with schema extensions` no es opcional. Todas las funciones del proyecto llevan
-- `set search_path = ''` y las invocan por su nombre completo —`extensions.crypt(...)`,
-- `extensions.uuid_generate_v5(...)`— así que una copia instalada en `public` no
-- serviría de nada: la llamada seguiría buscándolas donde no están.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
```

Si se te olvida alguna, `supabase db push` te lo dirá: hay una migración que lo comprueba
y falla con el nombre de la que falta. Está ahí porque sin ella el despliegue termina en
verde y el sistema revienta la primera vez que alguien se registra.

## 3.b Sembrar los datos de demostración

`supabase db push` aplica las migraciones pero **no ejecuta `supabase/seed.sql`**. Sin esa
semilla no existe el tenant plantilla, y `/demo` falla con `NOT_A_DEMO_TEMPLATE` — es
decir, la demostración entera, que es la razón de ser del enlace del currículum.

Pega el contenido de `supabase/seed.sql` en el **editor SQL** de Supabase y ejecútalo una
vez.

> ⚠️ **Nunca `supabase db reset --linked`.** Eso borra la base de producción entera.

## 4. Vercel

1. **Add New → Project** e importa el repositorio. Vercel detecta pnpm y Next solo.
2. **Root Directory**: ponlo en **`apps/web`**, y deja marcada la opción de incluir
   archivos de fuera del directorio raíz. En la raíz del repositorio no hay ninguna
   dependencia de `next` —está en `apps/web/package.json`— así que Vercel no detecta el
   framework y despliega un sitio estático vacío. Ahí es también donde vive
   `vercel.json`, con el cron de respaldo de la purga.
3. Variables de entorno (**Settings → Environment Variables**):

| Variable                        | Valor                       | Marcar como sensible |
| ------------------------------- | --------------------------- | -------------------- |
| `DATABASE_URL`                  | pooler, puerto 6543         | ✅                   |
| `DIRECT_URL`                    | directa, puerto 5432        | ✅                   |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto            | —                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                    | —                    |
| `NEXT_PUBLIC_SITE_URL`          | `https://tu-app.vercel.app` | —                    |
| `REQUEST_HASH_SECRET`           | `openssl rand -base64 32`   | ✅                   |
| `CRON_SECRET`                   | `openssl rand -base64 32`   | ✅                   |

`REQUEST_HASH_SECRET` es la sal con la que se hashea la IP en el limitador de intentos. Sin
ella el hash se puede deshacer: el espacio de IPv4 se recorre entero en minutos, y la tabla
pasaría de guardar un rastro anónimo a guardar direcciones.

`CRON_SECRET` protege `/api/cron/purge`, que borra datos. Si se deja vacío, el endpoint
responde 404 en lugar de abrirse: uno que borra y se abre cuando falta configuración es la
peor de las dos opciones. Vercel manda ese secreto en la cabecera `Authorization` de sus
crons automáticamente.

4. **Region**: en **Settings → Functions**, elige la misma región que Supabase. Sin esto
   cada consulta cruza medio mundo y el tiempo de respuesta se dispara entre 150 y 300 ms.

## 5. Mantener el proyecto vivo ⚠️

**Este paso no es opcional.** Supabase **pausa los proyectos del plan gratuito tras 7
días sin actividad de base de datos**. Si alguien abre el enlace de tu CV el día ocho,
ve un error — el peor fallo posible para lo que este proyecto pretende ser.

**a) Workflow de GitHub** (ya incluido en `.github/workflows/keepalive.yml`)

En **Settings → Secrets and variables → Actions → Variables**, añade:

| Variable  | Valor                            |
| --------- | -------------------------------- |
| `APP_URL` | `https://tu-proyecto.vercel.app` |

**b) Monitor externo — también obligatorio**

GitHub **deshabilita los workflows programados tras 60 días sin commits**. Si dejas el
proyecto quieto un par de meses, el keepalive se apaga solo y Supabase se pausa después.

Registra `https://tu-proyecto.vercel.app/api/health` en [cron-job.org](https://cron-job.org)
o [UptimeRobot](https://uptimerobot.com), ambos gratuitos, con intervalo de 6 horas.

## 6. Comprobar

```bash
curl https://tu-proyecto.vercel.app/api/health
```

Debe responder `200` y haber tocado la base de datos de verdad, no solo el proceso Node.

Luego, a mano:

- [ ] La portada carga en menos de 2 s.
- [ ] El listado de clientes muestra datos.
- [ ] La cuota del plan aparece en la cabecera del listado.
- [ ] El aviso _"Documento no fiscal"_ está presente.
- [ ] Dos cuentas en dos navegadores no ven los datos de la otra, ni forzando ids en la URL.
- [ ] El workflow de keepalive se ejecuta correctamente (lánzalo a mano una vez).

---

## Qué vigilar después

| Métrica                    | Dónde                                                         | Umbral        |
| -------------------------- | ------------------------------------------------------------- | ------------- |
| Tamaño de la base de datos | Supabase → Database                                           | 350 MB de 500 |
| Egress                     | Supabase → Usage                                              | 4 GB de 5     |
| Invocaciones de función    | Vercel → Usage                                                | 800 K de 1 M  |
| Sandboxes activos          | `select count(*) from demo_sessions where expires_at > now()` | 50            |

El circuit breaker degrada la aplicación automáticamente antes de llegar al límite: en
lugar de caer, deja de crear sandboxes y sirve una demo compartida de solo lectura. Un
visitante siempre ve algo funcionando, nunca un error de cuota.

## Si algún día quisieras cobrar por esto

El plan Hobby de Vercel prohíbe el uso comercial. La migración serían **Vercel Pro**
($20/mes) y **Supabase Pro** ($25/mes), sin tocar código: lo único acoplado a Vercel es
`next.config.ts`, y las tareas programadas ya viven en `pg_cron`, dentro de Postgres.
