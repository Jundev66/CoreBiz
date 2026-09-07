/**
 * Reglas de arquitectura hexagonal, verificadas en CI.
 *
 * Los boundaries de este proyecto NO dependen de la disciplina de quien escribe:
 * romper uno rompe el build. Esa es la diferencia entre una arquitectura real y
 * un diagrama bonito en el README.
 *
 *   domain        -> no depende de NADA (ni de otro package, ni de node_modules)
 *   application   -> solo domain
 *   contracts     -> solo zod
 *   db            -> drizzle + domain (tipos)
 *   infrastructure-> puede con todo excepto apps/
 *   apps/web      -> nunca toca drizzle ni SQL directamente
 */
module.exports = {
  forbidden: [
    // ── El corazon: el dominio es puro ────────────────────────────────────
    {
      name: 'domain-is-pure',
      comment:
        'packages/domain no puede importar NADA fuera de si mismo. Ni frameworks, ni ORM, ' +
        'ni utilidades de terceros. Si necesitas algo del exterior, es una senal de que ' +
        'deberia ser un puerto en packages/application.',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: {
        pathNot: '^packages/domain/src',
        dependencyTypesNot: ['type-only'],
      },
    },

    // ── La aplicacion define puertos, no los implementa ───────────────────
    {
      name: 'application-no-infra',
      comment:
        'packages/application solo puede depender de packages/domain. Los adaptadores ' +
        'concretos (drizzle, supabase, http) se inyectan en el composition root.',
      severity: 'error',
      from: { path: '^packages/application/src' },
      to: { path: '^(packages/(infrastructure|db|testing)|apps)/' },
    },
    {
      name: 'ports-are-leaves',
      comment: 'Un puerto describe una capacidad; no puede depender de un caso de uso.',
      severity: 'error',
      from: { path: '^packages/application/src/ports' },
      to: { path: '^packages/application/src/(use-cases|queries)' },
    },

    // ── El ORM vive en su sitio ───────────────────────────────────────────
    {
      name: 'no-orm-outside-infra',
      comment:
        'drizzle-orm y postgres solo se importan desde packages/db y packages/infrastructure. ' +
        'Si aparecen en apps/web o en el dominio, la persistencia se ha filtrado fuera del adaptador.',
      severity: 'error',
      from: { pathNot: '^packages/(db|infrastructure|testing)/' },
      to: { path: 'node_modules/(drizzle-orm|postgres)/' },
    },
    {
      name: 'ui-no-direct-db',
      comment: 'La capa web habla con casos de uso y queries, nunca con tablas.',
      severity: 'error',
      from: { path: '^apps/web/(app|src/ui)/' },
      to: { path: '^packages/(db|infrastructure)/src/(drizzle|schema)/' },
    },

    // ── SEGURIDAD: cuarentena de la service_role key ──────────────────────
    {
      name: 'service-role-quarantine',
      comment:
        'SEGURIDAD CRITICA: la service_role key BYPASSEA row level security. El modulo que ' +
        'la usa solo puede importarse desde los tres consumidores autorizados (provision del ' +
        'sandbox demo, cron de health y seeds). Cualquier otra importacion convierte el ' +
        'multi-tenant en decorativo. Ver docs/THREAT_MODEL.md.',
      severity: 'error',
      from: {
        pathNot: [
          '^packages/infrastructure/src/supabase/admin\.ts$',
          '^apps/web/app/api/demo/provision/route\.ts$',
          '^apps/web/app/api/cron/',
          '^packages/db/src/seed/',
        ],
      },
      to: { path: '^packages/infrastructure/src/supabase/admin\.ts$' },
    },

    // ── Higiene general ───────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment:
        'Las dependencias circulares hacen imposible razonar sobre el orden de inicializacion.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\.[^/]+\.(js|cjs|mjs|ts|json)$',
          '\.d\.ts$',
          '(^|/)tsconfig\.json$',
          '(^|/)(babel|webpack)\.config\.(js|cjs|mjs|ts)$',
          '^packages/[^/]+/src/index\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'no-dev-dep-in-src',
      comment: 'Una devDependency en codigo de produccion revienta el build de Vercel.',
      severity: 'error',
      from: { path: '^(packages|apps)/[^/]+/src/', pathNot: '\.(spec|test)\.tsx?$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys|querystring)$' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // `.next` es salida de build: incluirla no anade informacion y llena el
    // diagrama de dependencias de archivos generados con nombres ilegibles.
    exclude: { path: '\.(spec|test)\.tsx?$|/__tests__/|^e2e/\.features-gen/|^apps/web/\.next/' },
    tsPreCompilationDeps: true,
    /**
     * `tsconfig.depcruise.json` y no el base, a proposito.
     *
     * El alias `@/` vive en apps/web/tsconfig.json, y depcruise lee UN solo
     * tsconfig para resolver rutas. Con el base, las 22 importaciones escritas
     * como `@/...` quedaban SIN RESOLVER: aparecian como modulos fantasma sin
     * destino, y el grafo real de la aplicacion web estaba roto por la mitad.
     *
     * Lo que eso costaba: las reglas que dependen de ALCANZABILIDAD —ciclos,
     * modulos huerfanos— no podian seguir esas aristas, y el diagrama de
     * dependencias mostraba un `apps/web` desconectado de su propio `src/`.
     * Las reglas por RUTA (`domain-is-pure`, `ui-no-direct-db`, la cuarentena de
     * la clave privilegiada) seguian funcionando, porque comparan rutas de
     * archivo y no recorren el grafo.
     *
     * Se descubrio por un aviso de `no-orphans` sobre un componente que si
     * estaba importado: el aviso era la punta del problema, no el problema.
     */
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)',
        theme: {
          graph: { rankdir: 'TD', splines: 'ortho', bgcolor: 'transparent' },
          modules: [
            { criteria: { source: '^packages/domain' }, attributes: { fillcolor: '#7dcfb6' } },
            { criteria: { source: '^packages/application' }, attributes: { fillcolor: '#00b2ca' } },
            {
              criteria: { source: '^packages/infrastructure' },
              attributes: { fillcolor: '#f79256' },
            },
            { criteria: { source: '^packages/db' }, attributes: { fillcolor: '#fbd1a2' } },
            {
              criteria: { source: '^apps/web' },
              attributes: { fillcolor: '#1d4e89', fontcolor: '#ffffff' },
            },
          ],
        },
      },
    },
  },
};
