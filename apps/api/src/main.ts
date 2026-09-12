import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { cargarEntornoDeDesarrollo } from './config/dotenv';
import { loadEnv } from './config/env';
import { AllExceptionsFilter } from './http/all-exceptions.filter';

/**
 * Arranque de la API.
 *
 * `reflect-metadata` va en la PRIMERA linea del proceso, antes que cualquier otro
 * import: Nest lee los metadatos de los decoradores al evaluar los modulos, y si el
 * polyfill llega despues la inyeccion falla con un error que habla de dependencias
 * y no de esto.
 */
async function bootstrap(): Promise<void> {
  // El `.env` de la raiz se lee ANTES de validar, y solo fuera de produccion. El
  // validador valida; de donde sale la configuracion lo decide el proceso.
  cargarEntornoDeDesarrollo();

  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  // Express announces itself in `X-Powered-By` by default. It stops nothing, but a public
  // API has no reason to hand out its framework for free.
  (app.getHttpAdapter().getInstance() as { disable(setting: string): void }).disable(
    'x-powered-by',
  );

  // Todo error sale con el mismo sobre `{ errorKind, errorParams }`, y lo inesperado
  // no cuenta que ha pasado: el mensaje de una excepcion de Postgres lleva dentro
  // nombres de tabla y a veces el valor que fallo.
  app.useGlobalFilters(new AllExceptionsFilter());

  /*
   * CORS queda DESACTIVADO, y es una decision.
   *
   * Nada en el navegador llama a esta API: apps/web habla con ella desde el
   * servidor y reenvia el token que guarda en una cookie httpOnly (ADR 006). Si
   * algun dia hiciera falta abrir CORS, la pregunta correcta no es que origen
   * permitir, es por que el token ha llegado al navegador.
   */

  /*
   * The docs are only published when asked for by name. An open OpenAPI document for an
   * ERP is a free map of its entire write surface; in development it is the best way to
   * see the whole API at a glance.
   *
   * The condition used to be `NODE_ENV !== 'production'`, which fails on the dangerous
   * side: that value defaults to `development`. See `DOCS_ENABLED` in `config/env.ts`.
   */
  if (env.DOCS_ENABLED) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CoreBiz API')
        .setDescription('Adaptador primario HTTP sobre los casos de uso de CoreBiz.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  /*
   * '0.0.0.0' y no localhost. Render comprueba la salud desde fuera del contenedor:
   * escuchando solo en la interfaz local el health check no responde nunca y el
   * despliegue revierte con un mensaje sobre escaneo de puertos que no menciona
   * el bind, que es lo unico que hacia falta saber.
   */
  await app.listen(env.PORT, '0.0.0.0');

  new Logger('bootstrap').log(
    `CoreBiz API escuchando en el puerto ${env.PORT} (driver: ${env.DATA_DRIVER})`,
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('bootstrap').error(error);
  process.exit(1);
});
