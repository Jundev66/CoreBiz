import {
  GoodsReceipt,
  Money,
  Quantity,
  Supplier,
  asId,
  type Currency,
  type GoodsReceiptStatus,
  type ProductId,
  type SupplierId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import type { GoodsReceiptRepository, Page, SupplierRepository } from '@corebiz/application';
import type { Prisma } from '@corebiz/prisma-client';
import type { Tx } from './session';
import { estadoValido } from './mappers';
import { decodeCursor, encodeCursor, escapeLikeWildcards, pageLimit } from './pagination';

/**
 * Adaptadores de compras.
 *
 * Simetricos a los de ventas, y por la misma razon: el documento se guarda con sus lineas
 * en la misma transaccion, y lo que puede cambiar despues de recibir es solo el estado.
 * Numero, proveedor, cantidades y costes quedan congelados — una recepcion describe lo que
 * llego ese dia, y eso no se reescribe.
 */

type SupplierRow = Prisma.suppliersGetPayload<object>;
type ReceiptRow = Prisma.goods_receiptsGetPayload<object>;
type ReceiptLineRow = Prisma.goods_receipt_linesGetPayload<object>;

function toSupplier(row: SupplierRow): Supplier {
  return Supplier.rehydrate(asId<SupplierId>(row.id), {
    tenantId: asId<TenantId>(row.tenant_id),
    code: row.code,
    name: row.name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    contactName: row.contact_name,
    notes: row.notes,
    archivedAt: row.archived_at,
  });
}

export class PrismaSupplierRepository implements SupplierRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: SupplierId): Promise<Supplier | null> {
    const row = await this.tx.suppliers.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    return row === null ? null : toSupplier(row);
  }

  async findByCode(code: string): Promise<Supplier | null> {
    const row = await this.tx.suppliers.findFirst({
      where: { tenant_id: this.tenantId, code: code.trim().toUpperCase() },
    });
    return row === null ? null : toSupplier(row);
  }

  async list(filter: {
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<Page<Supplier>> {
    const limit = pageLimit(filter.limit);
    const search = filter.search?.trim() ?? '';

    // Paginacion por keyset, igual que en clientes: sin OFFSET, para que la pagina veinte
    // cueste lo mismo que la primera. El OR de dos ramas sustituye a la comparacion de
    // tuplas, que Prisma no expresa.
    const cursor = decodeCursor(filter.cursor);

    const rows = await this.tx.suppliers.findMany({
      where: {
        tenant_id: this.tenantId,
        archived_at: null,
        ...(search !== ''
          ? {
              OR: [
                { name: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                { code: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                { tax_id: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(cursor !== null
          ? {
              OR: [{ name: { gt: cursor.sort } }, { name: cursor.sort, id: { gt: cursor.id } }],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

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

    await this.tx.suppliers.upsert({
      where: { id: supplier.id },
      create: {
        id: supplier.id,
        tenant_id: this.tenantId,
        code: props.code,
        name: props.name,
        tax_id: props.taxId,
        email: props.email,
        phone: props.phone,
        contact_name: props.contactName,
        notes: props.notes,
        archived_at: props.archivedAt,
      },
      update: {
        name: props.name,
        tax_id: props.taxId,
        email: props.email,
        phone: props.phone,
        contact_name: props.contactName,
        notes: props.notes,
        archived_at: props.archivedAt,
      },
    });
  }
}

function toReceipt(row: ReceiptRow, lines: readonly ReceiptLineRow[]): GoodsReceipt {
  const currency = row.currency as Currency;

  return GoodsReceipt.rehydrate(row.id, {
    tenantId: asId<TenantId>(row.tenant_id),
    number: row.number,
    supplierId: asId<SupplierId>(row.supplier_id),
    status: estadoValido<GoodsReceiptStatus>(
      row.status,
      ['received', 'voided'],
      'goods_receipts.status',
    ),
    currency,
    lines: [...lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        lineNo: line.line_no,
        productId: asId<ProductId>(line.product_id),
        descriptionSnapshot: line.description_snapshot,
        unitSnapshot: line.unit_snapshot,
        quantity: Quantity.fromScaled(line.quantity),
        unitCost: Money.fromMinor(line.unit_cost_minor, currency),
        lineTotal: Money.fromMinor(line.line_total_minor, currency),
      })),
    total: Money.fromMinor(row.total_minor, currency),
    supplierReference: row.supplier_reference,
    notes: row.notes,
    receivedAt: row.received_at,
    receivedBy: row.received_by === null ? null : asId<UserId>(row.received_by),
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  });
}

export class PrismaGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  private async linesFor(receiptIds: readonly string[]): Promise<Map<string, ReceiptLineRow[]>> {
    if (receiptIds.length === 0) return new Map();

    const rows = await this.tx.goods_receipt_lines.findMany({
      where: { tenant_id: this.tenantId, goods_receipt_id: { in: [...receiptIds] } },
    });

    const grouped = new Map<string, ReceiptLineRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.goods_receipt_id);
      if (bucket === undefined) grouped.set(row.goods_receipt_id, [row]);
      else bucket.push(row);
    }
    return grouped;
  }

  private async loadOne(row: ReceiptRow | null): Promise<GoodsReceipt | null> {
    if (row === null) return null;
    const lines = await this.linesFor([row.id]);
    return toReceipt(row, lines.get(row.id) ?? []);
  }

  async findById(id: string): Promise<GoodsReceipt | null> {
    return this.loadOne(
      await this.tx.goods_receipts.findFirst({ where: { tenant_id: this.tenantId, id } }),
    );
  }

  async findByNumber(number: string): Promise<GoodsReceipt | null> {
    return this.loadOne(
      await this.tx.goods_receipts.findFirst({ where: { tenant_id: this.tenantId, number } }),
    );
  }

  async list(filter: { supplierId?: string; limit?: number }): Promise<Page<GoodsReceipt>> {
    const limit = pageLimit(filter.limit);

    const rows = await this.tx.goods_receipts.findMany({
      where: {
        tenant_id: this.tenantId,
        ...(filter.supplierId !== undefined ? { supplier_id: filter.supplierId } : {}),
      },
      orderBy: { received_at: 'desc' },
      take: limit,
    });

    // Las lineas de TODAS las recepciones en una sola consulta. Pedirlas por documento
    // serian N+1 consultas dentro de una transaccion abierta.
    const lines = await this.linesFor(rows.map((r) => r.id));

    return {
      items: rows.map((row) => toReceipt(row, lines.get(row.id) ?? [])),
      nextCursor: null,
    };
  }

  async save(receipt: GoodsReceipt): Promise<void> {
    const props = receipt.snapshot;

    await this.tx.goods_receipts.upsert({
      where: { id: receipt.id },
      create: {
        id: receipt.id,
        tenant_id: this.tenantId,
        number: props.number,
        supplier_id: props.supplierId,
        status: props.status,
        currency: props.currency,
        total_minor: props.total.minorUnits,
        supplier_reference: props.supplierReference,
        notes: props.notes,
        received_at: props.receivedAt,
        received_by: props.receivedBy,
        voided_at: props.voidedAt,
        void_reason: props.voidReason,
      },
      // Solo lo que puede cambiar despues de recibir. Numero, proveedor, cantidades y
      // costes quedan congelados: una recepcion describe lo que llego ese dia, y eso no se
      // reescribe.
      update: {
        status: props.status,
        voided_at: props.voidedAt,
        void_reason: props.voidReason,
        notes: props.notes,
      },
    });

    if (props.lines.length > 0) {
      await this.tx.goods_receipt_lines.createMany({
        data: props.lines.map((line) => ({
          tenant_id: this.tenantId,
          goods_receipt_id: receipt.id,
          line_no: line.lineNo,
          product_id: line.productId,
          description_snapshot: line.descriptionSnapshot,
          unit_snapshot: line.unitSnapshot,
          quantity: line.quantity.scaledValue,
          unit_cost_minor: line.unitCost.minorUnits,
          line_total_minor: line.lineTotal.minorUnits,
        })),
        skipDuplicates: true,
      });
    }
  }
}
