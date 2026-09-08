import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

/** La API vive en su propio proceso desde que la capa de entrega es NestJS. */
const API_PORT = 3211;
const API_URL = `http://127.0.0.1:${API_PORT}`;

/** `memory` (por defecto) o `postgres`. Ver el comentario de `webServer` al final. */
const DRIVER = process.env.E2E_DRIVER === 'postgres' ? 'postgres' : 'memory';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

/** La clave anonima local es fija y publica: la imprime `supabase start`. */
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Compartido entre las dos aplicaciones para los endpoints internos. */
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? 'secreto-solo-para-la-suite-e2e';

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
  /**
   * DOS servidores, y Playwright los arranca en paralelo esperando a los dos.
   *
   * El de la API se comprueba contra `/health`, que responde 200 en los dos drivers.
   * Sin esa espera, los primeros escenarios entrarian contra una API que todavia esta
   * levantando y fallarian por una carrera que no tiene nada que ver con lo que
   * prueban.
   *
   * `reuseExistingServer` sigue siendo false en CI, y ahora importa el doble: una API
   * viva de una corrida anterior serviria el build ANTERIOR, y los tests pasarian
   * contra codigo que ya no existe.
   */
  webServer: [
    {
      command: 'node ../apps/api/dist/apps/api/src/main.js',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATA_DRIVER: DRIVER,
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        INTERNAL_API_SECRET: INTERNAL_SECRET,
        ...(DRIVER === 'postgres'
          ? {
              DATABASE_URL,
              SUPABASE_URL: SUPABASE_URL,
              // `next start` y esta API son procesos de LARGA VIDA, no funciones
              // serverless. Con el pool en uno, cada transaccion bloquea a las demas
              // y los tests fallan por espera — que es exactamente lo que le pasaria
              // a quien autoalojara esto.
              DATABASE_MAX_CONNECTIONS: '10',
              // La suite abre varios visitantes desde la MISMA maquina para comprobar
              // que sus sandboxes estan aislados. Con el limite de produccion —uno por
              // hora y origen— ese test no se puede escribir.
              DEMO_MAX_PER_HOUR: '20',
            }
          : {}),
      },
    },
    {
      command: 'pnpm --filter @corebiz/web exec next start -p ' + PORT,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATA_DRIVER: DRIVER,
        NODE_ENV: 'production',
        API_BASE_URL: API_URL,
        INTERNAL_API_SECRET: INTERNAL_SECRET,
        ...(DRIVER === 'postgres'
          ? {
              // La web ya no habla con Postgres, pero Supabase Auth si: el acceso, el
              // alta y la recuperacion siguen siendo suyos.
              NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
              NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
              // Cincuenta accesos desde la misma IP en un minuto chocan contra el
              // limite de produccion —ocho— y la suite falla entera por un bloqueo que
              // en realidad demuestra que el limite funciona.
              LOGIN_MAX_PER_MINUTE: '500',
            }
          : {}),
      },
    },
  ],
});
