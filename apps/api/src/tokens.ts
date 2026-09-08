/**
 * Simbolos de inyeccion.
 *
 * Este archivo NO importa nada, y esa es su razon de ser: los controllers necesitan
 * los tokens para pedir sus dependencias, pero no pueden alcanzar el composition
 * root — si pudieran, podrian fabricarse un `TenantContext` a mano y ahi se acaba el
 * aislamiento por tenant. Una regla de dependency-cruiser lo hace cumplir.
 */

/** Identidad ya verificada. La pone el middleware de autenticacion. */
export const IDENTITY = Symbol('IDENTITY');

/** Empresas a las que pertenece quien llama. Puede estar vacia. */
export const MEMBERSHIPS = Symbol('MEMBERSHIPS');

/**
 * `{ ctx, session }` o `null` cuando la cuenta existe pero no pertenece a ninguna
 * empresa. Ese estado es LEGITIMO —pasa entre el alta y la creacion del negocio— y
 * por eso viaja como `null` y no como excepcion: solo `/v1/session` sabe que hacer
 * con el, y lo que hace es contarlo para que la interfaz lleve a `/onboarding`.
 */
export const ACTIVE_CONTEXT = Symbol('ACTIVE_CONTEXT');

/** El contexto, ya exigido. Falla si no hay empresa activa. */
export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');

export const SESSION_INFO = Symbol('SESSION_INFO');
export const RUNTIME = Symbol('RUNTIME');
export const USE_CASES = Symbol('USE_CASES');
export const JWT_VERIFIER = Symbol('JWT_VERIFIER');
