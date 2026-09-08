import { sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { TenantId } from '@corebiz/domain';
import type { DocumentSequences, DocumentType } from '@corebiz/application';
import type { Tx } from './tx';

const { documentSequences } = schema;

type DocType = DocumentType;

/**
 * Prefijos con los que se crea la secuencia la primera vez.
 *
 * Solo se usan al dar de alta la fila. A partir de ahi manda la columna, para
 * que un tenant pueda numerar sus documentos como quiera sin tocar el codigo.
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

export class DrizzleDocumentSequences implements DocumentSequences {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  /**
   * Consume el siguiente correlativo.
   *
   * El upsert bloquea la fila igual que un `select ... for update`, pero en una
   * sola sentencia y resolviendo ademas el primer uso: con SELECT y luego INSERT
   * habria una carrera en la que dos transacciones simultaneas crean la misma
   * secuencia. Aqui la segunda espera a que la primera confirme y despues
   * incrementa sobre el valor ya escrito.
   *
   * Que el correlativo viva en una tabla y no en una SEQUENCE nativa es
   * deliberado: las secuencias de Postgres NO se revierten. Con una de ellas,
   * cada emision fallida dejaria un hueco en la numeracion, y una numeracion con
   * huecos no se puede explicar.
   */
  async next(docType: DocType, period = ''): Promise<string> {
    const rows = await this.tx
      .insert(documentSequences)
      .values({
        tenantId: this.tenantId,
        docType,
        period,
        prefix: INITIAL_PREFIXES[docType],
        // Se inserta ya consumido el numero 1: esta llamada devuelve el 1 y la
        // siguiente encontrara el 2 esperando.
        nextNumber: 2,
      })
      .onConflictDoUpdate({
        target: [documentSequences.tenantId, documentSequences.docType, documentSequences.period],
        set: { nextNumber: sql`${documentSequences.nextNumber} + 1` },
      })
      .returning({
        prefix: documentSequences.prefix,
        padding: documentSequences.padding,
        nextNumber: documentSequences.nextNumber,
      });

    const row = rows[0];
    if (row === undefined) {
      // No deberia poder ocurrir: el upsert siempre devuelve una fila. Si ocurre,
      // algo va muy mal con la conexion y seguir seria emitir un documento sin
      // numero. Es un fallo de infraestructura, asi que se lanza.
      throw new Error(`No se pudo consumir el correlativo de ${docType}`);
    }

    const consumed = row.nextNumber - 1;
    const prefix = row.prefix === '' ? INITIAL_PREFIXES[docType] : row.prefix;
    const number = String(consumed).padStart(row.padding, '0');

    // Con periodo el codigo va pegado —`CLT26000001`— y sin el lleva guion
    // —`NE-000008`—. El guion sobra cuando ya hay un ano separando el prefijo del
    // numero, y estorba al escribirlo o dictarlo por telefono.
    return period === '' ? `${prefix}-${number}` : `${prefix}${period}${number}`;
  }
}
