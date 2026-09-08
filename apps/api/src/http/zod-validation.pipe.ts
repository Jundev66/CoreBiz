import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { ApiErrorBody } from './api-error';

/**
 * Validacion de entrada con los MISMOS esquemas que usa la interfaz.
 *
 * Se usa zod y no `class-validator` a proposito. No es preferencia de estilo: los
 * esquemas de `@corebiz/contracts` ya los comparte el formulario del navegador, y ese
 * uso compartido es lo que impide que la validacion de cliente y la de servidor
 * divergan — de donde sale la mitad de los agujeros de validacion en un CRUD.
 *
 * Todos los esquemas llevan `.strict()`: una propiedad no declarada es un ERROR y no
 * algo que se ignore en silencio. Es la defensa contra mass assignment; sin ella, un
 * `tenantId` colado en el cuerpo podria llegar mas lejos de lo debido.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;

    /*
     * 400 y no 422, y la diferencia la usa la interfaz: 400 significa "esto no tiene
     * forma de peticion" y se pinta junto a los campos; 422 significa "esta bien
     * formada y el NEGOCIO ha dicho que no", y se pinta como aviso.
     */
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      // El primer error de cada campo y no el ultimo: es el que describe la causa
      // raiz, y ademas es el orden en el que el usuario los va a arreglar.
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = translationKeyFor(issue, value, field);
      }
    }

    const body: ApiErrorBody = { errorKind: 'InvalidFormat', errorParams: {}, fieldErrors };
    throw new BadRequestException(body);
  }
}

/**
 * Traduce un fallo de zod a una CLAVE, no a un mensaje.
 *
 * Nuestros esquemas ya ponen la clave a mano donde importa (`'TooShort'`,
 * `'InvalidFormat'`). Lo que zod genera solo cuando el campo no encaja de tipo es su
 * texto por defecto —"Invalid input: expected string, received undefined"— que es
 * ingles ya redactado, y colarlo en `fieldErrors` lo llevaria tal cual a la pantalla de
 * alguien que esta usando la aplicacion en espanol.
 *
 * Para distinguir "no lo has mandado" de "lo has mandado mal" se mira el valor ORIGINAL
 * y no una propiedad del issue: zod no garantiza `input` en todas sus variantes, y
 * apoyarse en ella daba `Required` para un `{"name": 123}`, que no falta — sobra.
 */
function translationKeyFor(
  issue: { code: string; message: string },
  raw: unknown,
  field: string,
): string {
  if (issue.code !== 'invalid_type') return issue.message;

  const present =
    typeof raw === 'object' &&
    raw !== null &&
    (raw as Record<string, unknown>)[field] !== undefined;

  return present ? 'InvalidFormat' : 'Required';
}
