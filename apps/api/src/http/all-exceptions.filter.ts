import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { ApiErrorBody } from './api-error';

/**
 * Todo error sale con el mismo sobre.
 *
 * Dos razones, y la segunda es de seguridad:
 *
 *  1. La interfaz traduce por CLAVE. Si un 401 de Nest saliera con `{statusCode,
 *     message}` y un error de dominio con `{errorKind, errorParams}`, la web tendria
 *     que adivinar cual le ha llegado para saber que enseñar.
 *  2. Un error no previsto NO cuenta lo que ha pasado. El mensaje de una excepcion de
 *     Postgres lleva dentro nombres de tabla, de columna y a veces el valor que fallo.
 *     Eso va al log del servidor, no al navegador de un desconocido. Es la misma
 *     disciplina que ya sigue `/api/health`.
 *
 * The unexpected is also given a reference. See `incidentId` below.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();

    /*
     * If headers were already sent, there is no response left to give.
     *
     * It happens when the request is an open stream that fails halfway. The
     * `res.status().json()` below would throw ERR_HTTP_HEADERS_SENT INSIDE the error
     * handler, and that second error is the one that would reach the log: the original —
     * the only one that matters — is lost. The stream is closed and that is it; the client
     * sees a dropped connection, which is exactly what happened.
     */
    if (res.headersSent) {
      this.logger.error(exception);
      res.end();
      return;
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(envelope(exception));
      return;
    }

    const incidentId = newIncidentId();

    /*
     * The unexpected is logged IN FULL, with a reference, and answered with nothing.
     *
     * The reference goes FIRST on the line so `grep INC-3F9A2C71` over the server log
     * finds it unambiguously: it is the only link between what the person sees on screen
     * and the trace that explains why.
     *
     * What the line does NOT carry, each omission on purpose:
     *
     *  - The request body: in an ERP it is a customer's name or a product's price, and a
     *    log gets read over someone's shoulder, pasted into a chat and stored by a third
     *    party.
     *  - The query string. `originalUrl` includes it, and worse things than the body travel
     *    there: the invitation preview used to carry its token that way — a bearer
     *    credential; it is a POST body now, but the next one may not be —, `?search=`
     *    whatever the operator typed looking for a
     *    customer, and `?actorEmail=` an email address. The database is careful not to store
     *    that token; this log must not be the back door.
     *
     * The company is logged as REQUESTED, not as fact: the client sends `x-corebiz-tenant`
     * and the API ignores it if it is not theirs. Logged plainly, a forged header would
     * attribute the incident to another company — and with eight hex digits collisions
     * exist, so support must be able to check the line against something verified. That is
     * why `user` is logged too: it comes from the token signature, not from the request.
     */
    const req = http.getRequest<AuthenticatedRequest>();
    const path = req.originalUrl.split('?')[0] ?? '';
    this.logger.error(
      `${incidentId} ${req.method} ${path} user=${req.auth?.userId ?? '-'} tenantPedido=${req.header('x-corebiz-tenant') ?? '-'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // In a header AS WELL as the body: the web's `get()` and `getOrNull()` discard a
    // failure's body and only build an Error message, so without this a broken read
    // would still leave nothing to hand to anyone.
    res.setHeader(INCIDENT_HEADER, incidentId);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      errorKind: 'Unexpected',
      errorParams: { incidentId },
    } satisfies ApiErrorBody);
  }
}

/** Where the reference travels when the body is not read. */
export const INCIDENT_HEADER = 'x-corebiz-incident';

/**
 * `INC-` and eight uppercase hex digits: `INC-3F9A2C71`.
 *
 * Twelve characters because this value gets READ OUT OVER THE PHONE. A full uuid is hard
 * to read, harder to retype and does not fit in a screenshot. Uppercase hex because
 * `0-9A-F` has no glyphs that get confused when read aloud.
 *
 * A collision between two incidents does not matter: the log line also carries a
 * timestamp, method and path. This does not identify an error, it helps find it.
 */
function newIncidentId(): string {
  return `INC-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function envelope(exception: HttpException): ApiErrorBody {
  const body = exception.getResponse();

  // Ya viene con el sobre puesto: los errores de dominio y los que lanzamos nosotros.
  if (typeof body === 'object' && body !== null && 'errorKind' in body) {
    return body as ApiErrorBody;
  }

  /*
   * Excepciones de Nest sin sobre —un 404 de ruta inexistente, un 413 por cuerpo
   * demasiado grande—. Se traducen a una clave generica por familia en lugar de
   * reenviar `message`, que en algunos casos incluye la ruta o el metodo pedidos.
   */
  return { errorKind: kindFor(exception.getStatus()), errorParams: {} };
}

/**
 * Clave generica por familia de estado.
 *
 * Un mapa y no una cadena de `if`: comparar un `number` suelto con miembros de
 * `HttpStatus` es justo lo que prohibe `no-unsafe-enum-comparison`, y con razon — el
 * dia que alguien pase 4033 por 403 la comparacion no salta, simplemente nunca acierta.
 */
const KIND_BY_STATUS: ReadonlyMap<number, string> = new Map([
  [HttpStatus.UNAUTHORIZED, 'Unauthenticated'],
  [HttpStatus.FORBIDDEN, 'Forbidden'],
  [HttpStatus.NOT_FOUND, 'NotFound'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'PayloadTooLarge'],
  [HttpStatus.TOO_MANY_REQUESTS, 'TooManyAttempts'],
]);

function kindFor(status: number): string {
  return KIND_BY_STATUS.get(status) ?? 'InvalidRequest';
}
