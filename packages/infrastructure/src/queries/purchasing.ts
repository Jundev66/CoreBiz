import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { schema, type Database } from '@corebiz/db';
import { Money } from '@corebiz/domain';
import type {
  GoodsReceiptLineView,
  GoodsReceiptListItem,
  GoodsReceiptView,
  Page,
  PurchasingQueries,
  SupplierListItem,
  SupplierOption,
  TenantContext,
} from '@corebiz/application';
import { readOnly } from '../drizzle/session';
import { quantity } from './format';
import { decodeCursor, encodeCursor, likePattern, pageLimit } from '../drizzle/pagination';

const { suppliers, goodsReceipts, goodsReceiptLines } = schema;

/**
 * Lado de LECTURA de compras.
 *
 * El nombre del proveedor se resuelve con un join en lugar de guardarse en el
 * documento, y esa asimetria con las lineas es deliberada: el nombre del
 * PRODUCTO se congela en la linea porque describe lo que llego aquel dia, pero
 * el proveedor es una referencia viva — si cambia de razon social, lo util es
 * ver la actual.
 */
class DrizzlePurchasingQueries implements PurchasingQueries {
  constructor(
    private readonly db: Database,
    private readonly ctx: TenantContext,
  ) {}

  suppliers(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<SupplierListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.db, this.ctx, async (tx) => {
      const conditions = [eq(suppliers.tenantId, this.ctx.tenantId)];
      if (filter.includeArchived !== true) conditions.push(isNull(suppliers.archivedAt));

      if (filter.search !== undefined && filter.search.trim() !== '') {
        const pattern = likePattern(filter.search);
        const match = or(
          ilike(suppliers.name, pattern),
          ilike(suppliers.code, pattern),
          ilike(suppliers.taxId, pattern),
        );
        if (match !== undefined) conditions.push(match);
      }

      const cursor = decodeCursor(filter.cursor);
      if (cursor !== null) {
        conditions.push(sql`(${suppliers.name}, ${suppliers.id}) > (${cursor.sort}, ${cursor.id})`);
      }

      const rows = await tx
        .select({
          id: suppliers.id,
          code: suppliers.code,
          name: suppliers.name,
          taxId: suppliers.taxId,
          contactName: suppliers.contactName,
          phone: suppliers.phone,
          archivedAt: suppliers.archivedAt,
        })
        .from(suppliers)
        .where(and(...conditions))
        .orderBy(asc(suppliers.name), asc(suppliers.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const visible = hasMore ? rows.slice(0, limit) : rows;
      const last = visible[visible.length - 1];

      return {
        items: visible.map((row): SupplierListItem => ({
          id: row.id,
          code: row.code,
          name: row.name,
          taxId: row.taxId,
          contactName: row.contactName,
          phone: row.phone,
          archived: row.archivedAt !== null,
        })),
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
      };
    });
  }

  supplierOptions(limit = 500): Promise<readonly SupplierOption[]> {
    return readOnly(this.db, this.ctx, async (tx) =>
      tx
        .select({ id: suppliers.id, code: suppliers.code, name: suppliers.name })
        .from(suppliers)
        .where(and(eq(suppliers.tenantId, this.ctx.tenantId), isNull(suppliers.archivedAt)))
        .orderBy(asc(suppliers.name))
        .limit(pageLimit(limit)),
    );
  }

  receipts(filter: { limit?: number }): Promise<Page<GoodsReceiptListItem>> {
    const limit = pageLimit(filter.limit);
    const currency = this.ctx.settings.baseCurrency;

    return readOnly(this.db, this.ctx, async (tx) => {
      // El conteo de lineas se calcula en la base de datos con un subselect en
      // lugar de traer las lineas y contarlas aqui. Para un listado de veinte
      // recepciones eso son veinte documentos completos que nadie va a mirar.
      const rows = await tx
        .select({
          id: goodsReceipts.id,
          number: goodsReceipts.number,
          status: goodsReceipts.status,
          supplierName: suppliers.name,
          totalMinor: goodsReceipts.totalMinor,
          receivedAt: goodsReceipts.receivedAt,
          lineCount: sql<number>`(
            select count(*)::int from ${goodsReceiptLines}
             where ${goodsReceiptLines.goodsReceiptId} = ${goodsReceipts.id}
          )`,
        })
        .from(goodsReceipts)
        .innerJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
        .where(eq(goodsReceipts.tenantId, this.ctx.tenantId))
        .orderBy(desc(goodsReceipts.receivedAt))
        .limit(limit);

      return {
        items: rows.map((row): GoodsReceiptListItem => ({
          id: row.id,
          number: row.number,
          status: row.status,
          supplierName: row.supplierName,
          total: Money.fromMinor(row.totalMinor, currency).toString(),
          lineCount: Number(row.lineCount),
          receivedAt: row.receivedAt,
        })),
        nextCursor: null,
      };
    });
  }

  /**
   * Una recepcion con sus lineas.
   *
   * Dos consultas y no un join: con un join, cada linea repetiria la cabecera
   * entera y habria que deduplicarla aqui. Para un documento de cinco lineas eso es
   * codigo de agrupacion a cambio de ahorrar un viaje que dura microsegundos.
   */
  receiptById(id: string): Promise<GoodsReceiptView | null> {
    const currency = this.ctx.settings.baseCurrency;

    return readOnly(this.db, this.ctx, async (tx) => {
      const rows = await tx
        .select({
          receipt: goodsReceipts,
          supplierName: suppliers.name,
          supplierCode: suppliers.code,
        })
        .from(goodsReceipts)
        .innerJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
        .where(and(eq(goodsReceipts.tenantId, this.ctx.tenantId), eq(goodsReceipts.id, id)))
        .limit(1);

      const row = rows[0];
      if (row === undefined) return null;

      const lines = await tx
        .select()
        .from(goodsReceiptLines)
        .where(
          and(
            eq(goodsReceiptLines.tenantId, this.ctx.tenantId),
            eq(goodsReceiptLines.goodsReceiptId, id),
          ),
        )
        .orderBy(asc(goodsReceiptLines.lineNo));

      const r = row.receipt;
      return {
        id: r.id,
        number: r.number,
        status: r.status,
        supplierName: row.supplierName,
        supplierCode: row.supplierCode,
        total: Money.fromMinor(r.totalMinor, currency).toString(),
        lineCount: lines.length,
        receivedAt: r.receivedAt,
        supplierReference: r.supplierReference,
        notes: r.notes,
        voidReason: r.voidReason,
        lines: lines.map((line): GoodsReceiptLineView => ({
          lineNo: line.lineNo,
          description: line.descriptionSnapshot,
          unit: line.unitSnapshot,
          quantity: quantity(line.quantity),
          unitCost: Money.fromMinor(line.unitCostMinor, currency).toString(),
          lineTotal: Money.fromMinor(line.lineTotalMinor, currency).toString(),
        })),
      };
    });
  }
}

export function drizzlePurchasingQueries(db: Database, ctx: TenantContext): PurchasingQueries {
  return new DrizzlePurchasingQueries(db, ctx);
}
