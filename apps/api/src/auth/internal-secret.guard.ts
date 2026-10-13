import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from '../config/env';

/**
 * Puerta de los endpoints internos.
 *
 * Los usa `apps/web` desde el servidor —el limitador de intentos y la purga— y nunca
 * un navegador. No llevan sesion de usuario porque se invocan ANTES de que exista una
 * (el limitador protege el propio acceso), asi que la unica credencial posible es un
 * secreto compartido entre los dos despliegues.
 *
 * Dos decisiones que no son de estilo:
 *
 *  - Si el secreto NO esta configurado, se responde 404 en lugar de abrirse. Uno de
 *    estos endpoints borra datos; abrirse ante una configuracion incompleta es la peor
 *    de las dos opciones. Es la misma regla que ya seguia `/api/cron/purge`.
 *  - 404 y no 401, tambien cuando el secreto es incorrecto: para quien no lo tiene,
 *    estos endpoints no existen.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = loadEnv().INTERNAL_API_SECRET;
    if (expected === undefined) throw new NotFoundException();

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new NotFoundException();

    if (!constantTimeEquals(header.slice('Bearer '.length), expected)) {
      throw new NotFoundException();
    }
    return true;
  }
}

/**
 * Comparacion en tiempo estrictamente constante usando digests SHA-256.
 *
 * Al hashear ambas cadenas antes de `timingSafeEqual`:
 *  1. Ambos buffers miden exactamente 32 bytes siempre, sin importar la longitud de entrada.
 *  2. No hay corte temprano por discrepancia de longitud (`a.length === b.length`), lo que
 *     impide a un atacante inferir siquiera la longitud del secreto por temporizacion.
 */
function constantTimeEquals(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
