import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { inMemoryRateLimiter, type RateLimiter } from '@corebiz/application';
import { loadEnv } from '../config/env';

/**
 * Puerta de la integracion externa (ConciliaBot).
 *
 * La llama un servicio de MAQUINA, sin sesion de usuario: la unica credencial posible es
 * una clave compartida que viaja como `Authorization: Bearer <key>`. Se separa de
 * `InternalSecretGuard` en un punto deliberado, y no es de estilo:
 *
 *  - Sin clave configurada se responde 404, igual que los internos: para quien no la
 *    tiene, la integracion no existe. Un endpoint que se abre cuando falta configuracion
 *    es la peor de las dos opciones.
 *  - Con la clave configurada pero AUSENTE o INCORRECTA se responde 401, no 404. Aqui la
 *    existencia ya no es un secreto: quien llama sabe que integra con este ERP, y lo unico
 *    que le falta es una credencial valida. Un 401 lo dice sin filtrar nada.
 *  - Los intentos fallidos estan limitados por IP (30 por minuto) para evitar ataques de
 *    fuerza bruta sobre la clave en despliegues publicos.
 */
@Injectable()
export class IntegrationsApiKeyGuard implements CanActivate {
  private readonly failedLimiter: RateLimiter = inMemoryRateLimiter();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expected = loadEnv().INTEGRATIONS_API_KEY;
    if (expected === undefined) throw new NotFoundException();

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';

    if (
      !header.startsWith('Bearer ') ||
      !constantTimeEquals(header.slice('Bearer '.length), expected)
    ) {
      const clientIp = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
      const decision = await this.failedLimiter.hit(`badApiKey:${clientIp}`, 30, 60);
      if (!decision.allowed) {
        throw new HttpException(
          { errorKind: 'TooManyAttempts', errorParams: { retryAfter: decision.retryAfterSeconds } },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw unauthorized();
    }

    return true;
  }
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
}

/**
 * Comparacion en tiempo estrictamente constante usando digests SHA-256.
 *
 * Al hashear ambas cadenas antes de `timingSafeEqual`:
 *  1. Ambos buffers miden exactamente 32 bytes siempre, sin importar la longitud de entrada.
 *  2. No hay corte temprano por discrepancia de longitud (`a.length === b.length`), lo que
 *     impide a un atacante inferir siquiera la longitud de la clave por temporizacion.
 */
function constantTimeEquals(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
