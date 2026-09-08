import { ConflictException, HttpException } from '@nestjs/common';
import type { Result } from '@corebiz/domain';

/**
 * El cuerpo de todo error de esta API.
 *
 * `errorKind` es una CLAVE DE TRADUCCION, nunca texto ya redactado: el idioma lo
 * decide la interfaz, que habla espanol e ingles. Si esta API empezara a devolver
 * mensajes, la i18n del proyecto se rompe y no hay forma de arreglarla desde el
 * cliente.
 */
export interface ApiErrorBody {
  readonly errorKind: string;
  readonly errorParams: Readonly<Record<string, string | number>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

/**
 * Codigos con significado propio. Todo lo demas es 422.
 *
 * 422 y no 400 a proposito: 400 significa "esto no tiene forma de peticion" —lo
 * devuelve la validacion de zod— y 422 significa "esta bien formada, y el NEGOCIO ha
 * dicho que no". Poder distinguirlas sin leer el cuerpo es lo que separa "revisa el
 * formulario" de "esa regla no te deja".
 *
 * OJO con los 404: el modelo de amenazas exige que un identificador de otra empresa
 * responda 404 y NO 403, para no confirmar que el recurso existe. Cambiar cualquiera
 * de estas cuatro lineas a 403 reintroduce esa fuga; `e2e/specs/security.spec.ts` lo
 * comprueba.
 */
const STATUS_BY_KIND: Readonly<Record<string, number>> = {
  Forbidden: 403,
  OnlyOwnerGrantsOwnership: 403,
  LastOwner: 403,

  // Tambien 403, y con el `kind` intacto: es lo que permite a la interfaz ofrecer
  // subir de plan en lugar de decir "no tienes permiso", que seria mentira.
  QuotaExceeded: 403,
  FeatureNotAvailable: 403,

  CustomerNotFound: 404,
  ProductNotFound: 404,
  SupplierNotFound: 404,
  MemberNotFound: 404,
  DeliveryNoteNotFound: 404,
  InvitationNotFound: 404,

  InsufficientStock: 409,
  DuplicateProduct: 409,
  InvalidTransition: 409,
  StockNotTracked: 409,
  NoActiveTenant: 409,

  TooManyAttempts: 429,
};

/**
 * Copia TODA propiedad escalar del error, no una lista blanca.
 *
 * Hoy cada Server Action copia su propio subconjunto —`customers.ts` copia `limit` y
 * `field`, `sales.ts` copia otros— y ya han divergido. Cuando una variante de error
 * gana un campo, la traduccion recibe un parametro ausente y el mensaje sale con un
 * hueco. Aqui no hay lista que mantener al dia.
 */
function paramsOf(error: Readonly<Record<string, unknown>>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(error)) {
    if (key === 'kind') continue;
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
    else if (typeof value === 'bigint') params[key] = value.toString();
  }
  return params;
}

export class DomainErrorException extends HttpException {
  constructor(error: { readonly kind: string }) {
    const body: ApiErrorBody = {
      errorKind: error.kind,
      errorParams: paramsOf(error),
    };
    super(body, STATUS_BY_KIND[error.kind] ?? 422);
  }
}

/**
 * Construye la excepcion a partir de una clave y unos parametros sueltos.
 *
 * Existe por una razon de tipos que conviene no "arreglar" ensanchando la firma de
 * `DomainErrorException`. Esa firma pide `{ kind: string }` y nada mas, asi que un
 * literal con campos de sobra lo rechaza — que es lo correcto en los controllers,
 * donde el error viene del dominio y ya trae su forma. Aqui, en cambio, la clave y
 * los parametros se conocen por separado.
 */
export function domainError(
  kind: string,
  params: Record<string, unknown> = {},
): DomainErrorException {
  return new DomainErrorException({ kind, ...params });
}

/** La cuenta existe pero todavia no pertenece a ninguna empresa. */
export class NoActiveTenantException extends ConflictException {
  constructor() {
    super({ errorKind: 'NoActiveTenant', errorParams: {} } satisfies ApiErrorBody);
  }
}

/**
 * Convierte un `Result` en valor o en excepcion HTTP.
 *
 * SIEMPRE en el controller, NUNCA dentro de `uow.run(...)`.
 *
 * `DrizzleUnitOfWork` revierte ante EXCEPCION y confirma ante `err(...)`. Los casos de
 * uso devuelven `err` como valor normal, y eso CONFIRMA la transaccion — funciona
 * porque todos validan antes de la primera escritura. Lanzar dentro de la transaccion
 * invierte esa semantica sin que nada avise: entradas de auditoria que desaparecen,
 * escrituras que se deshacen a medias, y ningun error en el log.
 */
export function unwrapOrThrow<T, E extends { readonly kind: string }>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new DomainErrorException(result.error);
}
