import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
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
 * Comparacion en tiempo constante.
 *
 * `===` sobre cadenas corta en el primer byte distinto, y esa diferencia de tiempo es
 * medible: basta para reconstruir el secreto byte a byte con suficientes intentos.
 * Las longitudes se comparan antes porque `timingSafeEqual` lanza si diferen — y esa
 * fuga (saber la longitud) no sirve de nada.
 */
function constantTimeEquals(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
