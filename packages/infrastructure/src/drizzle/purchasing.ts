import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import {
  GoodsReceipt,
  Money,
  Quantity,
  Supplier,
  asId,
  type Currency,
  type ProductId,
  type SupplierId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import type { GoodsReceiptRepository, Page, SupplierRepository } from '@corebiz/application';
import type { Tx } from './tx';
import { decodeCursor, encodeCursor, likePattern, pageLimit } from '../prisma/pagination';

const { suppliers, goodsReceipts, goodsReceiptLines } = schema;

/**
 * Adaptadores de compras sobre Drizzle.
 *
 * Simetricos a los de ventas, y por la misma razon: el documento se guarda con
 * sus lineas en la misma transaccion, y lo que puede cambiar despues de recibir
 * es solo el estado. Numero, proveedor, cantidades y costes quedan congelados —
 * una recepcion describe lo que llego ese dia, y eso no se reescribe.
 */

type SupplierRow = typeof suppliers.$inferSelect;
type ReceiptRow = typeof goodsReceipts.$inferSelect;
type ReceiptLineRow = typeof goodsReceiptLines.$inferSelect;

function toSupplier(row: SupplierRow): Supplier {
  return Supplier.rehydrate(asId<SupplierId>(row.id), {
    tenantId: asId<TenantId>(row.tenantId),
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    contactName: row.contactName,
    notes: row.notes,
    archivedAt: row.archivedAt,
  });
}

export class DrizzleSupplierRepository implements SupplierRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: SupplierId): Promise<Supplier | null> {
    const rows = await this.tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, this.tenantId), eq(suppliers.id, id)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toSupplier(row);
  }

  async findByCode(code: string): Promise<Supplier | null> {
    const rows = await this.tx
      .select()
      .from(suppliers)
      .where(
        and(eq(suppliers.tenantId, this.tenantId), eq(suppliers.code, code.trim().toUpperCase())),
      )
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toSupplier(row);
  }

  async list(filter: {
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<Supplier>> {
    const limit = pageLimit(filter.limit);
    const conditions = [eq(suppliers.tenantId, this.tenantId), isNull(suppliers.archivedAt)];

    if (filter.search !== undefined && filter.search.trim() !== '') {
      const pattern = likePattern(filter.search);
      const match = or(
        ilike(suppliers.name, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.taxId, pattern),
      );
      if (match !== undefined) conditions.push(match);
    }

    // Paginacion por keyset, igual que en clientes: sin OFFSET, para que la
    // pagina veinte cueste lo mismo que la primera.
    const cursor = decodeCursor(filter.cursor);
    if (cursor !== null) {
      conditions.push(sql`(${suppliers.name}, ${suppliers.id}) > (${cursor.sort}, ${cursor.id})`);
    }

    const rows = await this.tx
      .select()
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(asc(suppliers.name), asc(suppliers.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];

    return {
      items: visible.map(toSupplier),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
    };
  }

  async save(supplier: Supplier): Promise<void> {
    const props = supplier.snapshot;

    await this.tx
      .insert(suppliers)
      .values({
        id: supplier.id,
        tenantId: this.tenantId,
        code: props.code,
        name: props.name,
        taxId: props.taxId,
        email: props.email,
        phone: props.phone,
        contactName: props.contactName,
        notes: props.notes,
        archivedAt: props.archivedAt,
      })
      .onConflictDoUpdate({
        target: suppliers.id,
        set: {
          name: props.name,
          taxId: props.taxId,
          email: props.email,
          phone: props.phone,
          contactName: props.contactName,
          notes: props.notes,
          archivedAt: props.archivedAt,
        },
      });
  }
}

function toReceipt(row: ReceiptRow, lines: readonly ReceiptLineRow[]): GoodsReceipt {
  const currency = row.currency as Currency;

  return GoodsReceipt.rehydrate(row.id, {
    tenantId: asId<TenantId>(row.tenantId),
    number: row.number,
    supplierId: asId<SupplierId>(row.supplierId),
    purchaseOrderId: null,
    status: row.status as 'draft' | 'received' | 'voided',
    currency,
    lines: [...lines]
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        lineNo: line.lineNo,
        productId: asId<ProductId>(line.productId),
        descriptionSnapshot: line.descriptionSnapshot,
        unitSnapshot: line.unitSnapshot,
        quantity: Quantity.fromScaled(line.quantity),
        unitCost: Money.fromMinor(line.unitCostMinor, currency),
        lineTotal: Money.fromMinor(line.lineTotalMinor, currency),
      })),
    total: Money.fromMinor(row.totalMinor, currency),
    supplierReference: row.supplierReference,
    notes: row.notes,
    receivedAt: row.receivedAt,
    receivedBy: row.receivedBy === null ? null : asId<UserId>(row.receivedBy),
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  });
}

export class DrizzleGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  private async linesFor(receiptIds: readonly string[]): Promise<Map<string, ReceiptLineRow[]>> {
    if (receiptIds.length === 0) return new Map();

    const rows = await this.tx
      .select()
      .from(goodsReceiptLines)
      .where(
        and(
          eq(goodsReceiptLines.tenantId, this.tenantId),
          inArray(goodsReceiptLines.goodsReceiptId, [...receiptIds]),
        ),
      );

    const grouped = new Map<string, ReceiptLineRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.goodsReceiptId);
      if (bucket === undefined) grouped.set(row.goodsReceiptId, [row]);
      else bucket.push(row);
    }
    return grouped;
  }

  private async loadOne(row: ReceiptRow | undefined): Promise<GoodsReceipt | null> {
    if (row === undefined) return null;
    const lines = await this.linesFor([row.id]);
    return toReceipt(row, lines.get(row.id) ?? []);
  }

  async findById(id: string): Promise<GoodsReceipt | null> {
    const rows = await this.tx
      .select()
      .from(goodsReceipts)
      .where(and(eq(goodsReceipts.tenantId, this.tenantId), eq(goodsReceipts.id, id)))
      .limit(1);

    return this.loadOne(rows[0]);
  }

  async findByNumber(number: string): Promise<GoodsReceipt | null> {
    const rows = await this.tx
      .select()
      .from(goodsReceipts)
      .where(and(eq(goodsReceipts.tenantId, this.tenantId), eq(goodsReceipts.number, number)))
      .limit(1);

    return this.loadOne(rows[0]);
  }

  async list(filter: { supplierId?: string; limit?: number }): Promise<Page<GoodsReceipt>> {
    const limit = pageLimit(filter.limit);
    const conditions = [eq(goodsReceipts.tenantId, this.tenantId)];
    if (filter.supplierId !== undefined) {
      conditions.push(eq(goodsReceipts.supplierId, filter.supplierId));
    }

    const rows = await this.tx
      .select()
      .from(goodsReceipts)
      .where(and(...conditions))
      .orderBy(desc(goodsReceipts.receivedAt))
      .limit(limit);

    // Las lineas de TODAS las recepciones en una sola consulta. Pedirlas por
    // documento serian N+1 consultas dentro de una transaccion abierta.
    const lines = await this.linesFor(rows.map((r) => r.id));

    return {
      items: rows.map((row) => toReceipt(row, lines.get(row.id) ?? [])),
      nextCursor: null,
    };
  }

  async save(receipt: GoodsReceipt): Promise<void> {
    const props = receipt.snapshot;

    await this.tx
      .insert(goodsReceipts)
      .values({
        id: receipt.id,
        tenantId: this.tenantId,
        number: props.number,
        supplierId: props.supplierId,
        status: props.status,
        currency: props.currency,
        totalMinor: props.total.minorUnits,
        supplierReference: props.supplierReference,
        notes: props.notes,
        receivedAt: props.receivedAt,
        receivedBy: props.receivedBy,
        voidedAt: props.voidedAt,
        voidReason: props.voidReason,
      })
      .onConflictDoUpdate({
        target: goodsReceipts.id,
        // Solo lo que puede cambiar despues de recibir. Numero, proveedor,
        // cantidades y costes quedan congelados: una recepcion describe lo que
        // llego ese dia, y eso no se reescribe.
        set: {
          status: props.status,
          voidedAt: props.voidedAt,
          voidReason: props.voidReason,
          notes: props.notes,
        },
      });

    if (props.lines.length > 0) {
      await this.tx
        .insert(goodsReceiptLines)
        .values(
          props.lines.map((line) => ({
            tenantId: this.tenantId,
            goodsReceiptId: receipt.id,
            lineNo: line.lineNo,
            productId: line.productId,
            descriptionSnapshot: line.descriptionSnapshot,
            unitSnapshot: line.unitSnapshot,
            quantity: line.quantity.scaledValue,
            unitCostMinor: line.unitCost.minorUnits,
            lineTotalMinor: line.lineTotal.minorUnits,
          })),
        )
        .onConflictDoNothing();
    }
  }
}
