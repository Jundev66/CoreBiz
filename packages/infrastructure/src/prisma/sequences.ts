import type { TenantId } from '@corebiz/domain';
import type { DocumentSequences, DocumentType } from '@corebiz/application';
import type { Tx } from './session';

type DocType = DocumentType;

/**
 * Prefijos con los que se crea la secuencia la primera vez.
 *
 * Solo se usan al dar de alta la fila. A partir de ahi manda la columna, para que un
 * tenant pueda numerar sus documentos como quiera sin tocar el codigo.
 */
const INITIAL_PREFIXES: Readonly<Record<DocType, string>> = {
  delivery_note: 'NE',
  quote: 'PRE',
  purchase_order: 'OC',
  payment: 'REC',
  goods_receipt: 'RM',
  customer: 'CLT',
  product: 'PRD',
  supplier: 'PRV',
};

export class PrismaDocumentSequences implements DocumentSequences {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /**
   * Consume el siguiente correlativo.
   *
   * El upsert bloquea la fila igual que un `select ... for update`, pero en una sola
   * sentencia y resolviendo ademas el primer uso: con SELECT y luego INSERT habria una
   * carrera en la que dos transacciones simultaneas crean la misma secuencia. Aqui la
   * segunda espera a que la primera confirme y despues incrementa sobre el valor ya
   * escrito.
   *
   * Que el correlativo viva en una tabla y no en una SEQUENCE nativa es deliberado: las
   * secuencias de Postgres NO se revierten. Con una de ellas, cada emision fallida dejaria
   * un hueco en la numeracion, y una numeracion con huecos no se puede explicar.
   *
   * VA EN SQL CRUDO. El `upsert` de Prisma necesita dos objetos —`create` y `update`— y
   * eso obliga a que la clave viaje dos veces, pero sobre todo NO devuelve las columnas
   * del `returning` de forma que se pueda leer el valor YA incrementado en la misma
   * sentencia. Partirlo en escribir y luego leer reintroduce exactamente la carrera que
   * esta sentencia existe para cerrar: dos ventas simultaneas se llevarian el mismo
   * numero.
   */
  async next(docType: DocType, period = ''): Promise<string> {
    const rows = await this.tx.$queryRaw<
      { prefix: string; padding: number; next_number: bigint }[]
    >`
      insert into public.document_sequences (tenant_id, doc_type, period, prefix, next_number)
      values (${this.tenantId}::uuid, ${docType}, ${period}, ${INITIAL_PREFIXES[docType]}, 2)
      on conflict (tenant_id, doc_type, period)
      do update set next_number = public.document_sequences.next_number + 1
      returning prefix, padding, next_number
    `;

    const row = rows[0];
    if (row === undefined) {
      throw new Error(`No se pudo consumir el correlativo de ${docType}`);
    }

    // `Number` antes de restar: la columna es `bigint` y mezclarlo con un `number` lanza
    // en ejecucion. Se inserto ya consumido el numero 1, asi que esta llamada devuelve el
    // anterior al que queda esperando.
    const consumed = Number(row.next_number) - 1;
    const prefix = row.prefix === '' ? INITIAL_PREFIXES[docType] : row.prefix;
    const number = String(consumed).padStart(row.padding, '0');

    return period === '' ? `${prefix}-${number}` : `${prefix}${period}${number}`;
  }
}
