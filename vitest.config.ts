import { defineConfig } from 'vitest/config';

/**
 * Proyectos separados por nivel de la piramide de tests.
 *
 * `domain` y `application` no tocan IO y deben correr en menos de 5 s: son los que se
 * ejecutan en el pre-commit. `integration` levanta Postgres y solo corre en CI o bajo demanda.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          root: './packages/domain',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'application',
          root: './packages/application',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          root: './packages/infrastructure',
          environment: 'node',
          globals: true,
          include: ['tests/**/*.integration.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.test.ts', '**/*.d.ts', 'packages/testing/**'],
      // El dominio es donde vive la logica de negocio: se le exige mas que al resto.
      thresholds: {
        'packages/domain/src/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
});
