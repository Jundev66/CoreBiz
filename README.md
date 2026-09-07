# CoreBiz

Mini ERP SaaS multi-tenant para pequeños comercios. Arquitectura hexagonal en TypeScript,
aislamiento de datos con Row Level Security de PostgreSQL y una pirámide de tests completa.

> **Aviso legal.** CoreBiz genera **notas de entrega**: documentos internos **no fiscales**.
> No emite facturas fiscales, no aplica numeración de control ni cumple los requisitos de
> facturación de ninguna jurisdicción. El campo de impuesto es **informativo** y no constituye
> un tributo declarado. Cada documento generado lleva impresa la leyenda
> _"Documento no fiscal / sin valor fiscal"_.

---

## Qué demuestra este proyecto

|                   |                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arquitectura**  | Hexagonal (puertos y adaptadores) con DDD táctico y CQRS ligero. El dominio no tiene **ni una** dependencia y una regla de CI lo verifica.                                                           |
| **Multi-tenancy** | Aislamiento en cuatro capas: RLS de Postgres, contexto inyectado en la transacción, filtrado explícito en los repositorios y una matriz de tests que lo comprueba tabla por tabla.                   |
| **Testing**       | **360 tests**: 264 unitarios (Vitest + property-based con fast-check), 54 de integración contra Postgres real, 22 escenarios BDD en Gherkin y 20 E2E con Playwright, incluida accesibilidad con axe. |
| **Seguridad**     | RBAC, audit log inmutable, CSP con nonce, rate limiting, cuarentena de la clave privilegiada. Documentado en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).                                         |
| **SaaS**          | Planes con cuotas aplicadas en el dominio, gating de módulos y un circuit breaker que protege el presupuesto de infraestructura.                                                                     |

## Stack

**Next.js 16** (App Router) · **TypeScript** · **Supabase** (Postgres, Auth, Storage) ·
**Drizzle ORM** · **Zod** · **Tailwind CSS** · **Vitest** · **Playwright** + `playwright-bdd`

Desplegado en Vercel y Supabase, ambos en plan gratuito. Coste de operación: **$0**.

---

## Arranque rápido

```bash
corepack enable            # o: npm install -g pnpm
pnpm install
```

### Sin Docker — la vía rápida

```bash
pnpm dev:nodb
```

Arranca la aplicación **completa** con adaptadores en memoria precargados con datos de
ejemplo. No necesita Postgres, ni Docker, ni credenciales. Que esto sea posible no es un
truco de demo: es la consecuencia directa de que el dominio no sepa que existe una base
de datos. Si la arquitectura hexagonal fuese decorativa, este comando no podría existir.

### Con la base de datos real

```bash
pnpm db:start              # Supabase local en Docker + migraciones + seed
pnpm dev
```

### Comandos

| Comando                 | Qué hace                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm check`            | Formato, lint, tipos, arquitectura y tests unitarios. Lo que corre en CI.     |
| `pnpm test:unit`        | Dominio y aplicación. Sin IO, menos de 5 segundos.                            |
| `pnpm test:integration` | Repositorios y **matriz de aislamiento RLS**. Requiere Docker.                |
| `pnpm test:bdd`         | Escenarios Gherkin sobre la aplicación real, en memoria.                      |
| `pnpm test:bdd:pg`      | **Los mismos escenarios**, sin tocar una línea, contra Postgres con RLS.      |
| `pnpm test:e2e`         | Playwright con trazas y vídeo en los fallos.                                  |
| `pnpm arch`             | Verifica los límites entre capas. **Falla el build si el dominio se acopla.** |
| `pnpm arch:graph`       | Regenera el diagrama de dependencias.                                         |

---

## Estructura

```
packages/
  domain/          Reglas de negocio puras. CERO dependencias — mira su package.json.
  application/     Casos de uso y puertos (interfaces). Solo depende de domain.
  contracts/       Esquemas Zod compartidos entre servidor y cliente.
  db/              Esquema Drizzle, migraciones y seed.
  infrastructure/  Adaptadores: Postgres, Supabase, memoria, PDF.
apps/
  web/             Next.js. Server Actions y RSC como adaptadores primarios.
e2e/               Features en Gherkin y specs de Playwright.
supabase/          Migraciones SQL: RLS, funciones, triggers, pg_cron.
```

La dirección de las dependencias apunta **siempre hacia adentro**: nada de lo que rodea al
dominio puede filtrarse dentro de él. No es una convención documentada y luego olvidada —
lo comprueba `pnpm arch` en cada push, y romperlo rompe el build.

## Decisiones de arquitectura

Las decisiones con su contexto y sus alternativas descartadas están en [`docs/adr/`](docs/adr/):

1. [Arquitectura hexagonal con el dominio sin dependencias](docs/adr/001-arquitectura-hexagonal.md)
2. [Dinero en bigint y moneda dual con tasa congelada](docs/adr/002-dinero-y-moneda-dual.md)
3. [Notas de entrega en lugar de facturas fiscales](docs/adr/003-notas-de-entrega.md)
4. [Drizzle sobre postgres.js, no PostgREST](docs/adr/004-drizzle-sobre-postgrest.md)
5. [Aislamiento multi-tenant en cuatro capas](docs/adr/005-aislamiento-multi-tenant.md)

El análisis STRIDE completo, con los riesgos aceptados de forma consciente, está en
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Qué falta

El ciclo de venta funciona sobre Postgres real, con las políticas RLS ejecutándose en cada
push y con autenticación de verdad. Lo que queda ya no es fundacional: el **sandbox
efímero** de la demo y el **despliegue**. [`docs/ROADMAP.md`](docs/ROADMAP.md) dice exactamente qué queda, en qué
orden y por qué ese orden, incluyendo el estado honesto de cada capa.

### La demostración se abre sin cuenta, a propósito

Quien llega desde un enlace ve el sistema funcionando sin registrarse: sin sesión, la
aplicación sirve un tenant marcado `is_demo`, donde las cookies de rol y plan permiten
cambiar de papel y ver el RBAC y las cuotas actuando en vivo. Con sesión iniciada esas
cookies dejan de tener efecto.

La protección no es que la constante apunte al sitio correcto, es que **se comprueba la
marca `is_demo` en la fila**: apuntarla a una empresa real no la expone, redirige a la
pantalla de acceso. `DEMO_ENABLED=false` cierra la puerta entera.

## Tres detalles que resumen el enfoque

**La arquitectura rompe el build si se viola.** No es una convención documentada: se
comprobó inyectando a propósito un `import { z } from 'zod'` en el dominio, y `pnpm arch`
lo detectó. Además, `pnpm` con `hoist=false` hace que ese import ni siquiera resuelva.

**Los mismos escenarios corren sobre los dos adaptadores.** Los 14 escenarios Gherkin
pasan en memoria y contra Postgres con RLS activo, sin cambiar una línea. Esa es la
comprobación ejecutable de que la arquitectura hexagonal es real: si el dominio supiera que
existe una base de datos, `pnpm test:bdd:pg` no podría existir.

**Los tests encuentran bugs de verdad.** Tres ejemplos reales de este repositorio: el
descuento de stock se aplicaba línea a línea, así que un fallo en la última dejaba las
anteriores ya descontadas; la validación de formularios fallaba siempre porque React
inyecta campos propios en el `FormData`; y un test de coherencia de la matriz de permisos
detectó una contradicción entre dos reglas que yo mismo había escrito.

**La tasa de cambio queda congelada en cada documento.** Reimprimir una nota de marzo con
la tasa de septiembre no es un detalle cosmético: reescribiría el histórico contable del
negocio cada vez que alguien abre un PDF antiguo.

---

## Sobre los planes y el uso comercial

CoreBiz implementa un modelo freemium completo (cuotas por recurso, gating de módulos,
enforcement en el dominio) porque es parte de lo que el proyecto demuestra. **No se cobra
por él ni se ofrece como servicio comercial**: el plan Hobby de Vercel está limitado a uso
personal no comercial, y respetarlo es parte de conocer la plataforma sobre la que se
construye. La ruta de migración para un despliegue comercial está documentada en los ADR.

## Licencia

MIT
