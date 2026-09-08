import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
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
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(envelope(exception));
      return;
    }

    // Lo inesperado se registra ENTERO y se responde vacio.
    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      errorKind: 'Unexpected',
      errorParams: {},
    } satisfies ApiErrorBody);
  }
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
