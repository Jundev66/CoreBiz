import { Inject, Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { activeDriver } from '../config/driver';
import { JWT_VERIFIER } from '../tokens';
import type { SupabaseJwtVerifier } from './supabase-jwt.verifier';
import type { AuthenticatedRequest, VerifiedIdentity } from './authenticated-request';

/**
 * Resuelve la identidad ANTES que cualquier otra cosa.
 *
 * Es un MIDDLEWARE y no un guard, y la diferencia no es de estilo: en Nest los
 * providers `Scope.REQUEST` se instancian ANTES de que corran los guards
 * (`RouterExplorer` llama a `loadPerContext` y solo despues construye el manejador
 * que los ejecuta). Un provider que leyera una identidad puesta por un guard la
 * recibiria siempre `undefined`. Los middlewares si corren antes de todo.
 *
 * Si esto se "arregla" convirtiendolo en un guard, la API deja de saber quien llama.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(@Inject(JWT_VERIFIER) private readonly verifier: SupabaseJwtVerifier) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    // En modo memoria no hay identidades que verificar ni nada que aislar.
    if (activeDriver() === 'memory') {
      req.auth = MEMORY_IDENTITY;
      next();
      return;
    }

    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
    }

    req.auth = await this.verifier.verify(header.slice('Bearer '.length));
    next();
  }
}

/** El unico usuario del modo memoria. No existe fuera de el. */
export const MEMORY_IDENTITY: VerifiedIdentity = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: null,
};
