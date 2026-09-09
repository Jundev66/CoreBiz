import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { DeliveryNote, DeliveryNoteId, TenantId } from '@corebiz/domain';
import type { DeliveryNoteRepository, Page } from '@corebiz/application';
import { fromDeliveryNote, fromDeliveryNoteLines, toDeliveryNote } from './mappers';
import { pageLimit } from '../prisma/pagination';
import type { Tx } from './tx';

const { deliveryNotes, deliveryNoteLines } = schema;

type LineRow = typeof schema.deliveryNoteLines.$inferSelect;

export class DrizzleDeliveryNoteRepository implements DeliveryNoteRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: DeliveryNoteId): Promise<DeliveryNote | null> {
    const rows = await this.tx
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.tenantId, this.tenantId), eq(deliveryNotes.id, id)))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    const lines = await this.linesFor([row.id]);
    return toDeliveryNote(row, lines.get(row.id) ?? []);
  }

  async findByNumber(number: string): Promise<DeliveryNote | null> {
    const rows = await this.tx
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.tenantId, this.tenantId), eq(deliveryNotes.number, number)))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    const lines = await this.linesFor([row.id]);
    return toDeliveryNote(row, lines.get(row.id) ?? []);
  }

  async list(filter: {
    status?: string;
    customerId?: string;
    limit?: number;
  }): Promise<Page<DeliveryNote>> {
    const limit = pageLimit(filter.limit);
    const conditions = [eq(deliveryNotes.tenantId, this.tenantId)];

    if (filter.status !== undefined) conditions.push(eq(deliveryNotes.status, filter.status));
    if (filter.customerId !== undefined) {
      conditions.push(eq(deliveryNotes.customerId, filter.customerId));
    }

    const rows = await this.tx
      .select()
      .from(deliveryNotes)
      .where(and(...conditions))
      .orderBy(desc(deliveryNotes.number))
      .limit(limit);

    if (rows.length === 0) return { items: [], nextCursor: null };

    // Las lineas de TODAS las notas en una sola consulta. Pedirlas nota a nota
    // seria el N+1 clasico de un listado: veinticinco documentos en pantalla,
    // veintiseis viajes a la base de datos.
    const lines = await this.linesFor(rows.map((row) => row.id));

    return {
      items: rows.map((row) => toDeliveryNote(row, lines.get(row.id) ?? [])),
      nextCursor: null,
    };
  }

  /**
   * Guarda la cabecera y, si es nueva, sus lineas.
   *
   * Las lineas se insertan con `onConflictDoNothing` en lugar de borrarse y
   * reescribirse. Dos motivos: una nota emitida no cambia de lineas nunca —lo
   * garantiza el agregado—, y borrarlas exigiria permiso de administrador segun
   * las politicas RLS, asi que un vendedor no podria ni anular su propia nota.
   */
  async save(note: DeliveryNote): Promise<void> {
    const row = fromDeliveryNote(note);

    await this.tx
      .insert(deliveryNotes)
      .values(row)
      .onConflictDoUpdate({
        target: deliveryNotes.id,
        // Solo lo que puede cambiar despues de emitir: el estado y sus datos.
        // Numero, cliente, tasa y totales quedan congelados en el documento.
        set: {
          status: row.status,
          deliveredAt: row.deliveredAt,
          receivedBy: row.receivedBy,
          voidedAt: row.voidedAt,
          voidReason: row.voidReason,
          notes: row.notes,
        },
      });

    const lines = fromDeliveryNoteLines(note);
    if (lines.length > 0) {
      await this.tx.insert(deliveryNoteLines).values(lines).onConflictDoNothing();
    }
  }

  private async linesFor(noteIds: readonly string[]): Promise<Map<string, LineRow[]>> {
    const rows = await this.tx
      .select()
      .from(deliveryNoteLines)
      .where(
        and(
          eq(deliveryNoteLines.tenantId, this.tenantId),
          inArray(deliveryNoteLines.deliveryNoteId, [...noteIds]),
        ),
      );

    const grouped = new Map<string, LineRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.deliveryNoteId);
      if (bucket === undefined) grouped.set(row.deliveryNoteId, [row]);
      else bucket.push(row);
    }
    return grouped;
  }
}
