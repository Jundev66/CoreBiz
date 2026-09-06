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
4. En **Settings → API**, copia `URL`, `anon key` y `service_role key`.

> ⚠️ La `service_role key` **bypasea Row Level Security por completo**. Nunca la pongas
> en una variable con prefijo `NEXT_PUBLIC_`, ni la compartas en una captura de pantalla.

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
create extension if not exists "uuid-ossp";
```

## 4. Vercel

1. **Add New → Project** e importa el repositorio. Vercel detecta pnpm y Next solo.
2. **Root Directory**: déjalo en la raíz; el monorepo se resuelve por workspaces.
3. Variables de entorno (**Settings → Environment Variables**):

| Variable                        | Valor                     | Marcar como sensible |
| ------------------------------- | ------------------------- | -------------------- |
| `DATABASE_URL`                  | pooler, puerto 6543       | ✅                   |
| `DIRECT_URL`                    | directa, puerto 5432      | ✅                   |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto          | —                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                  | —                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key          | ✅                   |
| `DEMO_COOKIE_SECRET`            | `openssl rand -base64 32` | ✅                   |
| `CRON_SECRET`                   | `openssl rand -base64 32` | ✅                   |

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
