import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { resetEnv } from '../src/config/env';

/**
 * Que la aplicacion entera SE PUEDA MONTAR.
 *
 * Parece trivial y es el test que mas veces ha estado en rojo. La inyeccion de Nest se
 * resuelve al arrancar, no al compilar: un provider mal declarado pasa `tsc` sin una
 * queja y revienta al levantar, que es lo que Render haria revertir.
 *
 * Y hay un fallo peor que este test es lo unico que atrapa. `tsc` —que construye el
 * artefacto de produccion— emite `design:paramtypes`; esbuild —que es lo que usa
 * Vitest— NO, y lo ignora en silencio. Un constructor que declara su dependencia por
 * TIPO en lugar de con `@Inject(...)` arranca perfectamente compilado y falla aqui.
 * Por eso `emitDecoratorMetadata` esta apagado y toda la inyeccion es explicita: para
 * que no exista un codigo que funcione en produccion y no en los tests, ni al reves.
 *
 * Corre en modo memoria, asi que no necesita Postgres ni Supabase: es parte de
 * `pnpm test:unit` y se ejecuta en cada pre-push.
 */

let app: INestApplication;

beforeAll(async () => {
  process.env.DATA_DRIVER = 'memory';
  process.env.ALLOW_MEMORY_DRIVER = '1';
  resetEnv();

  // `abortOnError: false`: por defecto un fallo al montar el arbol llama a
  // `process.abort()`, y eso mata al worker de Vitest con un volcado nativo que no
  // menciona el provider que no se pudo resolver.
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('el arbol de dependencias de la API', () => {
  it('se monta entero sin depender de los metadatos de decorador', () => {
    expect(app).toBeDefined();
  });

  it('expone las rutas de todos los modulos de negocio', () => {
    const paths = registeredPaths(app);

    // Una por modulo. Si un modulo deja de estar en `AppModule`, la aplicacion sigue
    // arrancando tan contenta y sus pantallas dejan de funcionar: sin esta lista, eso
    // solo se descubre abriendo la aplicacion.
    for (const path of [
      '/health',
      '/v1/session',
      '/v1/customers',
      '/v1/products',
      '/v1/delivery-notes',
      '/v1/purchasing/suppliers',
      '/v1/administration/team',
      '/v1/reports/sales-summary',
      '/v1/usage',
    ]) {
      expect(paths).toContain(path);
    }
  });
});

/** Las rutas que Express tiene registradas, tal como quedaron tras montar los modulos. */
function registeredPaths(instance: INestApplication): string[] {
  const server = instance.getHttpAdapter().getInstance() as {
    router?: { stack?: { route?: { path?: string } }[] };
  };

  return (server.router?.stack ?? [])
    .map((layer) => layer.route?.path)
    .filter((path): path is string => typeof path === 'string');
}
