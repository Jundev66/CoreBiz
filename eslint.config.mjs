import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Reglas de lint del monorepo.
 *
 * dependency-cruiser vigila los limites ENTRE paquetes (ver .dependency-cruiser.cjs);
 * eslint-plugin-boundaries vigila los limites DENTRO de un paquete, que el primero
 * no distingue bien. Juntos cubren la arquitectura hexagonal completa.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'e2e/.features-gen/**',
      'supabase/.temp/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Un `any` en el dominio invalida las garantias que dan los value objects.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ── La web conoce FORMAS, no VALORES ──────────────────────────────────────
  //
  // apps/web ya no monta casos de uso: los invoca la API por HTTP. Pero sigue
  // necesitando los TIPOS de `@corebiz/application` —la forma de los modelos de
  // lectura, del contexto de tenant, de las entradas de cada comando— y eso es
  // legitimo: un tipo no arrastra nada a produccion y es lo que hace que el cliente
  // HTTP este comprobado contra el mismo puerto que cumple el adaptador Drizzle.
  //
  // La linea se traza donde importa: `allowTypeImports` deja pasar los tipos y prohibe
  // los VALORES. Ahi es donde estan las factorias `makeX` y los adaptadores en memoria,
  // que son las dos formas de volver a ejecutar logica de negocio dentro del front.
  //
  // Va en eslint y no en dependency-cruiser porque el barril del paquete exporta a la
  // vez tipos y valores: en el grafo de dependencias son la MISMA arista, y una regla
  // que no puede distinguirlas se leeria como una garantia sin poder fallar nunca.
  //
  // Lo que si se puede importar como valor es `@corebiz/application/ports`, otro
  // especificador: un puerto es un contrato, y ahi viven las politicas de limitacion.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@corebiz/application',
              allowTypeImports: true,
              message:
                'apps/web no ejecuta logica de negocio: la invoca por HTTP. Importa el tipo ' +
                'con `import type`, o el valor desde `@corebiz/application/ports` si es un ' +
                'contrato.',
            },
          ],
        },
      ],
    },
  },

  // ── Limites internos de cada paquete ──────────────────────────────────────
  {
    files: ['packages/**/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'packages/domain/src/**' },
        { type: 'ports', pattern: 'packages/application/src/ports/**' },
        { type: 'use-cases', pattern: 'packages/application/src/use-cases/**' },
        { type: 'queries', pattern: 'packages/application/src/queries/**' },
        // El esquema y el cliente de Postgres. Es un elemento propio para que solo
        // la infraestructura pueda alcanzarlo: si los casos de uso pudieran
        // importarlo, la arquitectura hexagonal seria decorativa.
        { type: 'db', pattern: 'packages/db/src/**' },
        { type: 'infrastructure', pattern: 'packages/infrastructure/src/**' },
      ],
      'boundaries/include': ['packages/**/*.ts'],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // El dominio no depende de nadie.
            {
              from: [{ element: { type: 'domain' } }],
              allow: [{ to: { element: { type: 'domain' } } }],
            },
            // Un puerto describe una capacidad; no puede conocer a quien lo usa.
            {
              from: [{ element: { type: 'ports' } }],
              allow: [{ to: { element: { type: ['domain', 'ports'] } } }],
            },
            // Los casos de uso orquestan el dominio a traves de puertos.
            {
              from: [{ element: { type: 'use-cases' } }],
              allow: [{ to: { element: { type: ['domain', 'ports', 'use-cases'] } } }],
            },
            {
              from: [{ element: { type: 'queries' } }],
              allow: [{ to: { element: { type: ['domain', 'ports', 'queries'] } } }],
            },
            // El esquema solo conoce el dominio (para tipar) y a si mismo. No puede
            // depender de casos de uso: una tabla no orquesta nada.
            {
              from: [{ element: { type: 'db' } }],
              allow: [{ to: { element: { type: ['domain', 'db'] } } }],
            },
            // La infraestructura implementa puertos: puede ver todo lo de arriba.
            {
              from: [{ element: { type: 'infrastructure' } }],
              allow: [
                {
                  to: {
                    element: {
                      type: ['domain', 'ports', 'use-cases', 'queries', 'infrastructure', 'db'],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },

  // El dominio es codigo puro: nada de globals de Node ni de navegador.
  {
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['packages/domain/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'El dominio no puede leer el entorno. Inyectalo por un puerto.',
        },
        {
          name: 'fetch',
          message: 'El dominio no hace IO. Define un puerto en @corebiz/application.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'El dominio no lee el reloj del sistema. Inyecta el puerto Clock.',
        },
      ],
    },
  },

  // Los tests pueden relajarse: assertions no nulas y valores forzados son normales aqui.
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // Archivos de configuracion en JS plano.
  {
    files: ['**/*.mjs', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Config de dependency-cruiser: CommonJS, y sus strings son patrones de expresion
  // regular donde `\.` es intencionado, no un escape sobrante.
  {
    files: ['**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      sourceType: 'commonjs',
      // Este archivo queda fuera de cualquier tsconfig a proposito, asi que el
      // servicio de proyecto de TypeScript no debe intentar resolverlo.
      parserOptions: { projectService: false, project: false },
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      // Hay que reponer las reglas de `disableTypeChecked`: un `rules` propio en el
      // mismo bloque sustituye al del spread en lugar de fusionarse con el.
      ...tseslint.configs.disableTypeChecked.rules,
      'no-useless-escape': 'off',
    },
  },

  prettier,
);
