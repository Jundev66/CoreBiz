import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

/** `memory` (por defecto) o `postgres`. Ver el comentario de `webServer` al final. */
const DRIVER = process.env.E2E_DRIVER === 'postgres' ? 'postgres' : 'memory';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Los escenarios Gherkin se compilan a specs de Playwright. El resultado corre en el
 * runner nativo, con sus trazas, sus reintentos y su reporte HTML.
 */
const bddTestDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
  outputDir: '.features-gen',
});

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Nadie deberia poder mezclar `test.only` en la rama principal.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // `exactOptionalPropertyTypes` prohibe pasar `undefined` explicito, asi que en local
  // la clave simplemente no se define y Playwright aplica su valor por defecto.
  ...(process.env.CI ? { workers: 2 } : {}),

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    // La traza solo se guarda al reintentar tras un fallo: es lo que hace depurable un
    // fallo intermitente de CI sin inflar cada corrida en verde.
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  },

  projects: [
    {
      name: 'bdd',
      testDir: bddTestDir,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testDir: './specs',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * La aplicacion arranca en modo memoria POR DEFECTO: sin Postgres, sin Docker y con
   * datos sembrados de forma determinista. Eso hace que la suite corra igual en el
   * portatil de cualquiera y en el runner gratuito de GitHub, sin servicios que
   * provisionar.
   *
   * Con `E2E_DRIVER=postgres` los MISMOS escenarios corren contra Supabase local. No es
   * una variante del suite: es la comprobacion de que la arquitectura hexagonal es real.
   * Si un solo escenario necesitara cambiar para pasar contra el otro adaptador, el
   * dominio sabria de la base de datos y el proyecto entero estaria mintiendo.
   *
   * Requiere una base recien sembrada, porque los escenarios que dan de alta clientes
   * dejan huella: `pnpm test:bdd:pg` hace el reset antes de arrancar.
   */
  webServer: {
    command: 'pnpm --filter @corebiz/web exec next start -p ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATA_DRIVER: DRIVER,
      NODE_ENV: 'production',
      ...(DRIVER === 'postgres' ? { DATABASE_URL } : {}),
    },
  },
});
