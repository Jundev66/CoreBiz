import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
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
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: true });

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
   * La documentacion no se publica en produccion. Un OpenAPI abierto de un ERP es
   * un mapa gratuito de toda la superficie de escritura; en desarrollo es la mejor
   * forma de ver la API entera de un vistazo.
   */
  if (env.NODE_ENV !== 'production') {
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
