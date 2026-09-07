import { createHash, randomBytes } from 'node:crypto';
import type { InvitationToken, TokenFactory } from '@corebiz/application';

/**
 * Generacion de tokens de invitacion.
 *
 * 32 bytes de `randomBytes`, que es un generador criptograficamente seguro.
 * `Math.random()` NO lo es: su salida es predecible a partir de unas pocas
 * muestras, y un token de invitacion predecible es una puerta abierta a
 * cualquier empresa que tenga una invitacion viva.
 *
 * base64url y no hexadecimal porque el token viaja en una URL: en hex harian
 * falta 64 caracteres para la misma entropia que ocupa 43 en base64url, y un
 * enlace que no cabe en una linea es un enlace que se copia mal.
 *
 * El hash es SHA-256 sin sal, y eso es correcto aqui aunque suene mal. No es una
 * contrasena elegida por una persona: son 256 bits aleatorios, asi que no hay
 * diccionario que recorrer ni tabla que precomputar. Meter bcrypt anadiria coste
 * sin anadir seguridad, y ademas impediria buscar la invitacion por su hash con
 * un indice — que es justo lo que hace la funcion SQL que valida la aceptacion.
 */
export function cryptoTokenFactory(): TokenFactory {
  return {
    next(): InvitationToken {
      const value = randomBytes(32).toString('base64url');
      return { value, hash: createHash('sha256').update(value).digest('hex') };
    },
  };
}

/** El mismo calculo que hace `app.accept_invitation()` en la base de datos. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
