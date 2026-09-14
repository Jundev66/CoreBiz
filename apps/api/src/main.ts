import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';

/**
 * The API as a long-lived process: development, CI and the E2E suite.
 *
 * Production does not start here — Vercel invokes `serverless.ts`. Both build the
 * application with the same `createApp()`, so what the tests start is what gets deployed.
 */
async function bootstrap(): Promise<void> {
  const { app, env } = await createApp();

  // '0.0.0.0' and not localhost: a health check from outside a container never reaches a
  // process bound to the loopback interface, and the error talks about port scanning
  // instead of the bind.
  await app.listen(env.PORT, '0.0.0.0');

  new Logger('bootstrap').log(
    `CoreBiz API escuchando en el puerto ${env.PORT} (driver: ${env.DATA_DRIVER})`,
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('bootstrap').error(error);
  process.exit(1);
});
