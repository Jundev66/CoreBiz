import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createCustomerSchema, issueDeliveryNoteSchema } from '@corebiz/contracts';
import { ZodValidationPipe } from '../src/http/zod-validation.pipe';

/**
 * La validacion del borde.
 *
 * Lo que se comprueba aqui no es que zod funcione, sino que lo que sale de la API
 * sigue siendo TRADUCIBLE. La interfaz habla espanol e ingles y pinta los errores por
 * clave; en cuanto uno de estos valores es una frase en ingles, esa frase acaba en la
 * pantalla de alguien tal cual.
 */
describe('validacion de entrada', () => {
  const customers = new ZodValidationPipe(createCustomerSchema);

  it('deja pasar lo valido', () => {
    expect(customers.transform({ name: 'Bodega La Esquina' })).toMatchObject({
      name: 'Bodega La Esquina',
    });
  });

  it('un campo que falta es Required', () => {
    expect(() => customers.transform({})).toThrow(BadRequestException);
    expect(fieldErrors(() => customers.transform({}))).toEqual({ name: 'Required' });
  });

  it('un campo con el tipo equivocado es InvalidFormat, no Required', () => {
    // No falta: sobra. Decir "Required" delante de un campo relleno manda al usuario a
    // rellenar lo que ya habia rellenado.
    expect(fieldErrors(() => customers.transform({ name: 123 }))).toEqual({
      name: 'InvalidFormat',
    });
  });

  it('conserva las claves que declara el esquema', () => {
    expect(fieldErrors(() => customers.transform({ name: 'A' }))).toEqual({ name: 'TooShort' });
  });

  it('ningun mensaje se parece a una frase en ingles', () => {
    const errors = fieldErrors(() =>
      customers.transform({ name: 'A', email: 'esto-no-es-un-correo' }),
    );

    for (const value of Object.values(errors)) {
      // Las claves del proyecto son PascalCase de una sola palabra compuesta. El texto
      // por defecto de zod ("Invalid input: expected string...") lleva espacios.
      expect(value).toMatch(/^[A-Za-z]+$/);
    }
  });

  it('rechaza propiedades no declaradas', () => {
    // `.strict()` es la defensa contra mass assignment: un `tenantId` colado en el
    // cuerpo no puede llegar mas lejos que esta linea.
    expect(() => customers.transform({ name: 'Legitimo', tenantId: 'otra-empresa' })).toThrow(
      BadRequestException,
    );
  });

  it('una nota sin lineas SI pasa la validacion de forma', () => {
    // Y tiene que pasarla. Que una nota necesite al menos una linea es una regla de
    // NEGOCIO, y la aplica el dominio devolviendo `NoLines`. Comprobarla tambien aqui
    // parecia defensa en profundidad y era otra cosa: cambiaba un 422 con
    // `errorKind: 'NoLines'` por un 400 con la clave escondida en `fieldErrors`, y la
    // pantalla dejaba de encontrar el mensaje que llevaba enseñando desde siempre.
    // Lo detecto un escenario BDD que no habia que tocar.
    const notes = new ZodValidationPipe(issueDeliveryNoteSchema);
    expect(notes.transform({ customerId: 'c1', lines: [] })).toMatchObject({ lines: [] });
  });

  it('pero una linea con la forma equivocada no', () => {
    const notes = new ZodValidationPipe(issueDeliveryNoteSchema);
    expect(() => notes.transform({ customerId: 'c1', lines: [{ productId: 'p1' }] })).toThrow(
      BadRequestException,
    );
  });

  it('acepta identificadores que NO son uuid', () => {
    // El adaptador en memoria usa identificadores legibles a proposito. Exigir uuid
    // aqui rompia `pnpm dev:nodb` y la suite BDD entera, con un error de validacion en
    // el borde que el dominio nunca llegaba a ver.
    const notes = new ZodValidationPipe(issueDeliveryNoteSchema);
    expect(
      notes.transform({
        customerId: '00000000-0000-0000-0000-0000000c001',
        lines: [{ productId: '00000000-0000-0000-0000-0000000p004', quantity: '2' }],
      }),
    ).toMatchObject({ customerId: '00000000-0000-0000-0000-0000000c001' });
  });
});

function fieldErrors(run: () => unknown): Record<string, string> {
  try {
    run();
  } catch (error) {
    const body = (error as BadRequestException).getResponse() as {
      fieldErrors?: Record<string, string>;
    };
    return body.fieldErrors ?? {};
  }
  throw new Error('Se esperaba un error de validacion y no hubo ninguno.');
}
