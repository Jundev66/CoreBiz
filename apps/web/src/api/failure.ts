import type { ApiFailure } from './client';

/**
 * Un fallo de la API, convertido en estado de formulario.
 *
 * Antes esto estaba escrito cinco veces, una por módulo, y cada copia mantenía su
 * propia lista de parámetros a rescatar: `['limit', 'resource', 'requiredPlan', 'sku',
 * 'field']` en compras, `['limit', 'resource', 'email', 'field', 'raw']` en
 * administración, y en clientes solo `limit` y `field`. Ya habían divergido.
 *
 * Lo que eso costaba no se ve como un error: cuando una variante de error del dominio
 * gana un campo, la traducción lo recibe ausente y el mensaje sale con un hueco —
 * `"Has alcanzado el límite de {limit}"` con el número en blanco— y solo en las
 * pantallas cuya lista no lo incluía. Una incoherencia que parece un fallo de
 * traducción y está a tres capas de distancia.
 *
 * Ahora no hay lista: la API ya copia todas las propiedades escalares del error, así
 * que aquí solo hay que dejarlas pasar.
 */
export interface FormFailure {
  readonly status: 'error';
  readonly errorKind: string;
  readonly errorParams: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export function toFormFailure(error: ApiFailure): FormFailure {
  return {
    status: 'error',
    errorKind: error.kind,
    errorParams: error.params,
    // Se conservan aparte porque se pintan aparte: junto a su input, no como aviso
    // general. `exactOptionalPropertyTypes` obliga a omitir la clave en lugar de
    // pasarla como `undefined`.
    ...(error.fieldErrors !== undefined ? { fieldErrors: error.fieldErrors } : {}),
  };
}
