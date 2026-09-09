import type { DeliveryNote, DeliveryNoteId, TenantId } from '@corebiz/domain';
import type { DeliveryNoteRepository, Page } from '@corebiz/application';
import type { Prisma } from '@corebiz/prisma-client';
import { fromDeliveryNote, fromDeliveryNoteLines, toDeliveryNote } from './mappers';
import { pageLimit } from './pagination';
import type { Tx } from './session';

type LineRow = Prisma.delivery_note_linesGetPayload<object>;

export class PrismaDeliveryNoteRepository implements DeliveryNoteRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: DeliveryNoteId): Promise<DeliveryNote | null> {
    const row = await this.tx.delivery_notes.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    if (row === null) return null;

    const lines = await this.linesFor([row.id]);
    return toDeliveryNote(row, lines.get(row.id) ?? []);
  }

  async findByNumber(number: string): Promise<DeliveryNote | null> {
    const row = await this.tx.delivery_notes.findFirst({
      where: { tenant_id: this.tenantId, number },
    });
    if (row === null) return null;

    const lines = await this.linesFor([row.id]);
    return toDeliveryNote(row, lines.get(row.id) ?? []);
  }

  async list(filter: {
    status?: string;
    customerId?: string;
    limit?: number;
  }): Promise<Page<DeliveryNote>> {
    const limit = pageLimit(filter.limit);

    const rows = await this.tx.delivery_notes.findMany({
      where: {
        tenant_id: this.tenantId,
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.customerId !== undefined ? { customer_id: filter.customerId } : {}),
      },
      orderBy: { number: 'desc' },
      take: limit,
    });

    if (rows.length === 0) return { items: [], nextCursor: null };

    // Las lineas de TODAS las notas en una sola consulta. Pedirlas nota a nota seria el
    // N+1 clasico de un listado: veinticinco documentos en pantalla, veintiseis viajes a
    // la base de datos.
    const lines = await this.linesFor(rows.map((row) => row.id));

    return {
      items: rows.map((row) => toDeliveryNote(row, lines.get(row.id) ?? [])),
      nextCursor: null,
    };
  }

  /**
   * Guarda la cabecera y, si es nueva, sus lineas.
   *
   * Las lineas se insertan ignorando los duplicados en lugar de borrarse y reescribirse.
   * Dos motivos: una nota emitida no cambia de lineas nunca —lo garantiza el agregado— y
   * borrarlas exigiria permiso de administrador segun las politicas RLS, asi que un
   * vendedor no podria ni anular su propia nota.
   */
  async save(note: DeliveryNote): Promise<void> {
    const row = fromDeliveryNote(note);

    await this.tx.delivery_notes.upsert({
      where: { id: row.id },
      create: row,
      // Solo lo que puede cambiar despues de emitir: el estado y sus datos. Numero,
      // cliente, tasa y totales quedan congelados en el documento.
      update: {
        status: row.status,
        delivered_at: row.delivered_at ?? null,
        received_by: row.received_by ?? null,
        voided_at: row.voided_at ?? null,
        void_reason: row.void_reason ?? null,
        notes: row.notes ?? null,
      },
    });

    const lines = fromDeliveryNoteLines(note);
    if (lines.length > 0) {
      // `skipDuplicates` es el equivalente de `on conflict do nothing`: reescribir una
      // nota ya guardada no debe fallar ni duplicar sus lineas.
      await this.tx.delivery_note_lines.createMany({ data: lines, skipDuplicates: true });
    }
  }

  private async linesFor(noteIds: readonly string[]): Promise<Map<string, LineRow[]>> {
    const rows = await this.tx.delivery_note_lines.findMany({
      where: { tenant_id: this.tenantId, delivery_note_id: { in: [...noteIds] } },
    });

    const grouped = new Map<string, LineRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.delivery_note_id);
      if (bucket === undefined) grouped.set(row.delivery_note_id, [row]);
      else bucket.push(row);
    }
    return grouped;
  }
}
