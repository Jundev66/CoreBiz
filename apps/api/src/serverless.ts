import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';

/**
 * The API as a Vercel function.
 *
 * The application is built ONCE per instance and reused by every invocation that lands on
 * it. Building it per request would pay Nest's whole module graph and a new Postgres pool
 * each time; with Fluid compute an instance also serves concurrent requests, so they all
 * await the same promise instead of racing to build their own.
 *
 * A failed build is FORGOTTEN rather than cached. Otherwise one bad start — a database
 * that was still waking up, say — would keep that instance answering errors until Vercel
 * recycled it.
 */

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

let listener: Promise<RequestListener> | null = null;

async function build(): Promise<RequestListener> {
  const { app } = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as RequestListener;
}

export async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  listener ??= build().catch((error: unknown) => {
    listener = null;
    throw error;
  });

  try {
    (await listener)(req, res);
  } catch (error) {
    // No detail on the wire: the message of a failed start can name the missing variable
    // or the database host.
    new Logger('serverless').error(error);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ errorKind: 'SERVICE_UNAVAILABLE' }));
  }
}
