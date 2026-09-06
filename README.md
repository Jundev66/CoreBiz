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

|                   |                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arquitectura**  | Hexagonal (puertos y adaptadores) con DDD táctico y CQRS ligero. El dominio no tiene **ni una** dependencia y una regla de CI lo verifica.                                         |
| **Multi-tenancy** | Aislamiento en cuatro capas: RLS de Postgres, contexto inyectado en la transacción, filtrado explícito en los repositorios y una matriz de tests que lo comprueba tabla por tabla. |
| **Testing**       | Unitarios (Vitest + property-based), integración contra Postgres real, BDD en Gherkin y E2E con Playwright.                                                                        |
| **Seguridad**     | RBAC, audit log inmutable, CSP con nonce, rate limiting, cuarentena de la clave privilegiada. Documentado en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).                       |
| **SaaS**          | Planes con cuotas aplicadas en el dominio, gating de módulos y un circuit breaker que protege el presupuesto de infraestructura.                                                   |

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
| `pnpm test:bdd`         | Escenarios Gherkin sobre la aplicación real.                                  |
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

Las decisiones con su contexto y sus alternativas descartadas están en [`docs/adr/`](docs/adr/).

---

## Sobre los planes y el uso comercial

CoreBiz implementa un modelo freemium completo (cuotas por recurso, gating de módulos,
enforcement en el dominio) porque es parte de lo que el proyecto demuestra. **No se cobra
por él ni se ofrece como servicio comercial**: el plan Hobby de Vercel está limitado a uso
personal no comercial, y respetarlo es parte de conocer la plataforma sobre la que se
construye. La ruta de migración para un despliegue comercial está documentada en los ADR.

## Licencia

MIT
