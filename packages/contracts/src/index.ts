/**
 * @corebiz/contracts — esquemas Zod compartidos entre la capa web y la aplicacion.
 *
 * Un unico schema por comando, reutilizado por el formulario (react-hook-form) y por
 * la Server Action. Asi la validacion de cliente y la de servidor no pueden divergir,
 * que es de donde salen la mitad de los agujeros de validacion en un CRUD.
 */
export * from './common.js';
