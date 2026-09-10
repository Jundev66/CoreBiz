# Despliegue

Guía para poner CoreBiz en producción con coste **$0**. Del repositorio vacío a una URL
viva en unos 40 minutos.

CoreBiz son **dos despliegues**: la interfaz (Next.js) en Vercel y la API (NestJS) en
Render, con Postgres y Auth en Supabase. El motivo está en
[ADR 009](adr/009-api-dedicada-en-nestjs.md); lo que hay que saber aquí es que las
variables de entorno se reparten entre las dos plataformas y que **hay un secreto que
tiene que ser el mismo en ambas**.

---

## Antes de empezar

Tres cuentas gratuitas, sin tarjeta:

| Servicio                         | Para qué                | Nota importante                                                                                 |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| [GitHub](https://github.com)     | Repositorio y CI        | **Público**. En privado, este CI (~10 min por push) agota los 2.000 min/mes en unos 200 pushes. |
| [Supabase](https://supabase.com) | Postgres, Auth, Storage | Crea el proyecto en la **misma región** que la función de Vercel.                               |
| [Vercel](https://vercel.com)     | La interfaz             | Plan Hobby: uso personal **no comercial**.                                                      |
| [Render](https://render.com)     | La API                  | Plan gratuito: **duerme a los 15 min** sin tráfico. Está contemplado, ver §6.                   |

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

5. En **Authentication → Sessions**, baja el **TTL del access token a 10 minutos**.

   No es un ajuste opcional. La API verifica la firma de los tokens **localmente**
   contra el JWKS del proyecto, en lugar de preguntar a Supabase en cada petición —eso
   ahorra un viaje de red por request, que sobre Render se nota—. El precio es que
   revocar una _cuenta_ tarda lo que le quede de vida al token. Con 10 minutos ese
   margen es aceptable, y el coste para el usuario es cero porque el middleware de Next
   refresca el token de forma transparente.

   Revocar un _acceso a una empresa_ sigue siendo inmediato: el contexto consulta las
   pertenencias en cada petición, y sin fila no hay acceso.

   > Esto **requiere claves de firma asimétricas**, que es lo que traen los proyectos
   > nuevos. Compruébalo abriendo `https://TU-PROYECTO.supabase.co/auth/v1/.well-known/jwks.json`:
   > si devuelve una clave `ES256`, todo correcto. Con el secreto HS256 compartido
   > habría que poner en Render una clave capaz de **emitir** tokens, no solo de
   > verificarlos, y eso es peor que el viaje de red que se quería ahorrar.

> La `service_role key` **no se usa en este proyecto y no hay que copiarla**. Bypasea Row
> Level Security por completo, y todo lo que necesitaría —crear una empresa, aceptar una
> invitación, provisionar una demostración— entra por funciones `SECURITY DEFINER`
> acotadas. Una clave capaz de saltarse el aislamiento entre empresas es la última que
> conviene tener dando vueltas por variables de entorno.

6. En **Authentication → URL Configuration**, pon el dominio de Vercel en **Site URL** y
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

## 4. Render — la API

1. **New → Blueprint** y apunta al repositorio. Render lee `render.yaml` de la raíz y
   crea el servicio con su build, su arranque y su health check ya configurados.

   Si prefieres hacerlo a mano: **New → Web Service**, runtime Node, y copia de
   `render.yaml` el `buildCommand`, el `startCommand` y `healthCheckPath`.

2. **Region**: la **misma que Supabase**. Sin esto cada consulta cruza medio mundo y se
   pagan entre 150 y 300 ms **por consulta**, sobre pantallas que hacen cuatro.

3. Variables de entorno (las marcadas `sync: false` en `render.yaml`):

| Variable       | Valor                                                  |
| -------------- | ------------------------------------------------------ |
| `DATABASE_URL` | pooler de Supabase, puerto 6543                        |
| `SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` (sin `NEXT_PUBLIC_`) |

`REQUEST_HASH_SECRET` **no va aquí**: la IP se hashea en Vercel, que es el único sitio
donde `x-forwarded-for` es de fiar. A la API solo le llega el hash.

`INTERNAL_API_SECRET` lo genera Render solo. **Cópialo**: hace falta idéntico en Vercel.

4. Cuando termine el despliegue, anota la URL (`https://corebiz-api.onrender.com`) y
   compruébala:

```bash
curl https://corebiz-api.onrender.com/health
```

Debe responder `{"status":"ok","driver":"postgres","database":"reachable"}`. Si dice
`unreachable`, la `DATABASE_URL` es incorrecta o la región no coincide.

> La documentación OpenAPI **no se publica en producción**, a propósito. Un mapa
> completo de la superficie de escritura de un ERP es reconocimiento gratis. En
> desarrollo está en `/docs`.

## 5. Vercel — la interfaz

1. **Add New → Project** e importa el repositorio. Vercel detecta pnpm y Next solo.
2. **Root Directory**: ponlo en **`apps/web`**, y deja marcada la opción de incluir
   archivos de fuera del directorio raíz. En la raíz del repositorio no hay ninguna
   dependencia de `next` —está en `apps/web/package.json`— así que Vercel no detecta el
   framework y despliega un sitio estático vacío. Ahí es también donde vive
   `vercel.json`, con el cron de respaldo de la purga.
3. Variables de entorno (**Settings → Environment Variables**):

| Variable                        | Valor                             | Sensible |
| ------------------------------- | --------------------------------- | -------- |
| `API_BASE_URL`                  | la URL de Render, sin barra final | —        |
| `INTERNAL_API_SECRET`           | **el mismo valor que en Render**  | ✅       |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto                  | —        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                          | —        |
| `NEXT_PUBLIC_SITE_URL`          | `https://tu-app.vercel.app`       | —        |
| `CRON_SECRET`                   | `openssl rand -base64 32`         | ✅       |

**`DATABASE_URL` NO va aquí.** Que Vercel no tenga acceso a la base de datos es la
prueba observable de que la interfaz dejó de hablar con Postgres. Si la pones "por si
acaso", nadie se dará cuenta de que algo volvió a usarla.

`CRON_SECRET` protege `/api/cron/purge`, que reenvía la orden de purga a la API. Si se
deja vacío, el endpoint responde 404 en lugar de abrirse: uno que borra y se abre cuando
falta configuración es la peor de las dos opciones. Vercel manda ese secreto en la
cabecera `Authorization` de sus crons automáticamente.

4. **Region**: en **Settings → Functions**, la misma que Render y Supabase. Las tres
   piezas hablan entre sí en cada petición; repartirlas por el mundo suma tres viajes.

## 6. Mantener el proyecto vivo ⚠️

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

Esa única URL recorre la cadena entera —Vercel → Render → Postgres— así que despierta
las dos piezas que se duermen. **Pon el timeout del monitor en 60 s o más**: si la API
llevaba rato dormida, la primera respuesta tarda.

**c) Lo que NO se hace: mantener Render despierto**

Sería tentador poner un ping cada 10 minutos para que el servicio no se duerma nunca.
No se hace, y conviene saber por qué: el plan gratuito da **750 horas-instancia al
mes** y sostener un servicio 24/7 son ~730. Cabría, sin ningún margen, y cualquier
redespliegue o segunda instancia se saldría del plan.

La decisión es la contraria: **aceptar el arranque en frío y contarlo**. Quien lo
encuentra ve `/waking-up`, que explica qué pasa, cuánto lleva y que solo ocurre una
vez. Ver [ADR 009](adr/009-api-dedicada-en-nestjs.md).

## 7. Comprobar

```bash
# La cadena entera: Vercel pregunta a Render, y Render a Postgres.
curl https://tu-proyecto.vercel.app/api/health

# Y la API por su cuenta, para saber cuál de las dos falla si algo falla.
curl https://corebiz-api.onrender.com/health
```

Los dos deben responder `200`, y el segundo con `database: "reachable"` — es decir,
habiendo tocado la base de verdad y no solo el proceso Node.

Luego, a mano:

- [ ] La portada carga en menos de 2 s **con la API caliente**.
- [ ] Con la API dormida, `/demo` lleva a la pantalla de espera y **vuelve sola** a
      `/demo` cuando despierta. No a un error, y no a la portada.
- [ ] El listado de clientes muestra datos.
- [ ] La cuota del plan aparece en la cabecera del listado.
- [ ] El aviso _"Documento no fiscal"_ está presente.
- [ ] Dos cuentas en dos navegadores no ven los datos de la otra, ni forzando ids en la URL.
- [ ] **Con el token de una cuenta, llamar a la API directamente tampoco alcanza los
      datos de la otra.** Es una comprobación nueva: antes no había una API que atacar.
- [ ] `https://corebiz-api.onrender.com/docs` responde **404** en producción.
- [ ] El workflow de keepalive se ejecuta correctamente (lánzalo a mano una vez).

---

## Qué vigilar después

| Métrica                    | Dónde                                                         | Umbral        |
| -------------------------- | ------------------------------------------------------------- | ------------- |
| Tamaño de la base de datos | Supabase → Database                                           | 350 MB de 500 |
| Egress                     | Supabase → Usage                                              | 4 GB de 5     |
| Invocaciones de función    | Vercel → Usage                                                | 800 K de 1 M  |
| Horas de instancia         | Render → Usage                                                | 600 h de 750  |
| Sandboxes activos          | `select count(*) from demo_sessions where expires_at > now()` | 50            |

El circuit breaker degrada la aplicación automáticamente antes de llegar al límite: en
lugar de caer, deja de crear sandboxes y sirve una demo compartida de solo lectura. Un
visitante siempre ve algo funcionando, nunca un error de cuota.

## Si algún día quisieras cobrar por esto

El plan Hobby de Vercel prohíbe el uso comercial. La migración serían **Vercel Pro**
($20/mes), **Render Starter** ($7/mes, que además **no duerme** y hace innecesaria la
pantalla de espera) y **Supabase Pro** ($25/mes), sin tocar código: lo único acoplado a
Vercel es `next.config.ts`, la API es un proceso Node corriente que corre en cualquier
sitio, y las tareas programadas ya viven en `pg_cron`, dentro de Postgres.
