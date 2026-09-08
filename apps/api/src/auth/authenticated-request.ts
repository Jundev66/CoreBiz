import type { Request } from 'express';

/** Identidad ya verificada de quien hace la peticion. */
export interface VerifiedIdentity {
  readonly userId: string;
  readonly email: string | null;
}

/**
 * La peticion, con la identidad ya resuelta.
 *
 * `auth` lo rellena `AuthMiddleware` y lo leen los providers del composition root.
 * Es `VerifiedIdentity | undefined` a proposito: si algun dia una ruta se salta el
 * middleware, el tipo obliga a decidir que hacer en vez de dejar pasar `undefined`
 * disfrazado de usuario.
 */
export interface AuthenticatedRequest extends Request {
  auth?: VerifiedIdentity;
}
