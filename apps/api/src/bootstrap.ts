import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { cargarEntornoDeDesarrollo } from './config/dotenv';
import { loadEnv, type Env } from './config/env';
import { AllExceptionsFilter } from './http/all-exceptions.filter';

/**
 * Builds the whole application WITHOUT listening on a port.
 *
 * Two entry points share it, and that is the reason it exists: `main.ts`, the long-lived
 * process used by development, CI and the E2E suite, and `serverless.ts`, the function
 * Vercel invokes in production. If each one configured Nest on its own, the filter or the
 * docs switch could drift between them, and the one that drifted would be the one no test
 * starts.
 *
 * `reflect-metadata` is the FIRST import: Nest reads decorator metadata while evaluating
 * the modules, and if the polyfill arrives later injection fails with an error that talks
 * about dependencies instead of this.
 */
export async function createApp(): Promise<{ app: INestApplication; env: Env }> {
  // The root `.env` is read BEFORE validating, and only outside production. The validator
  // validates; where the configuration comes from is the process's decision.
  cargarEntornoDeDesarrollo();

  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  // Express announces itself in `X-Powered-By` by default. It stops nothing, but a public
  // API has no reason to hand out its framework for free.
  (app.getHttpAdapter().getInstance() as { disable(setting: string): void }).disable(
    'x-powered-by',
  );

  // Every error leaves with the same `{ errorKind, errorParams }` envelope, and the
  // unexpected ones do not say what happened: a Postgres exception message carries table
  // names and sometimes the value that failed.
  app.useGlobalFilters(new AllExceptionsFilter());

  /*
   * CORS stays DISABLED, and that is a decision.
   *
   * Nothing in the browser calls this API: apps/web talks to it from the server and
   * forwards the token it keeps in an httpOnly cookie (ADR 006). If CORS ever had to be
   * opened, the right question is not which origin to allow but why the token reached the
   * browser.
   */

  /*
   * The docs are only published when asked for by name. An open OpenAPI document for an
   * ERP is a free map of its entire write surface; in development it is the best way to
   * see the whole API at a glance. See `DOCS_ENABLED` in `config/env.ts`.
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

  return { app, env };
}
