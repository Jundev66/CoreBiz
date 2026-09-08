import { describe, expect, it } from 'vitest';
import { err, ok } from '@corebiz/domain';
import { DomainErrorException, domainError, unwrapOrThrow } from '../src/http/api-error';

/**
 * El contrato de errores de la API.
 *
 * Estos tests existen porque la interfaz traduce por CLAVE: si un `kind` deja de
 * viajar, o viaja sin sus parametros, el usuario ve un mensaje con un hueco o una
 * clave en crudo. Y porque los codigos HTTP aqui no son decorativos — la web decide
 * con ellos si repinta el formulario o manda al acceso.
 */
describe('mapeo de errores de dominio a HTTP', () => {
  it('devuelve el valor cuando el resultado es correcto', () => {
    expect(unwrapOrThrow(ok({ code: 'CLT26000001' }))).toEqual({ code: 'CLT26000001' });
  });

  it('convierte un error de dominio en excepcion HTTP', () => {
    expect(() => unwrapOrThrow(err({ kind: 'Forbidden' }))).toThrow(DomainErrorException);
  });

  it.each([
    ['Forbidden', 403],
    ['QuotaExceeded', 403],
    ['FeatureNotAvailable', 403],
    ['CustomerNotFound', 404],
    ['ProductNotFound', 404],
    ['InsufficientStock', 409],
    ['DuplicateProduct', 409],
    ['TooManyAttempts', 429],
  ])('%s responde %i', (kind, status) => {
    expect(new DomainErrorException({ kind }).getStatus()).toBe(status);
  });

  it('cualquier error no listado es 422 y no 500', () => {
    // 422 y no 400: la peticion estaba bien formada y fue el NEGOCIO quien dijo que
    // no. Y desde luego no 500, que le diria a la web que el fallo es del servidor.
    expect(new DomainErrorException({ kind: 'UnaReglaNuevaSinMapear' }).getStatus()).toBe(422);
  });

  it('un identificador ajeno responde 404 y NUNCA 403', () => {
    // El modelo de amenazas lo exige: un 403 confirmaria que el recurso existe. Si
    // este test se pone en rojo, alguien acaba de abrir una fuga de existencia.
    for (const kind of [
      'CustomerNotFound',
      'ProductNotFound',
      'SupplierNotFound',
      'MemberNotFound',
    ]) {
      expect(new DomainErrorException({ kind }).getStatus()).toBe(404);
    }
  });

  it('conserva la clave y TODOS los parametros escalares del error', () => {
    const body = domainError('QuotaExceeded', {
      resource: 'customers',
      limit: 25,
      scaled: 3_650_000_000n,
    }).getResponse();

    expect(body).toEqual({
      errorKind: 'QuotaExceeded',
      // Se copian todos, no una lista blanca: cada Server Action mantenia la suya y ya
      // habian divergido, asi que un campo nuevo llegaba a la traduccion como hueco.
      errorParams: { resource: 'customers', limit: 25, scaled: '3650000000' },
    });
  });

  it('no filtra objetos anidados en los parametros', () => {
    // Solo escalares. Un objeto del dominio dentro de la respuesta seria superficie
    // que nadie ha decidido publicar.
    const body = domainError('Forbidden', {
      actor: { userId: 'u1', role: 'viewer' },
      permission: 'customers:write',
    }).getResponse() as { errorParams: Record<string, unknown> };

    expect(body.errorParams).toEqual({ permission: 'customers:write' });
  });
});
