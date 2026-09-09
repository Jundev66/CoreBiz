import type { PrismaClient } from '@corebiz/prisma-client';
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
import { readOnly } from '../prisma/session';
import { quantity } from './format';
import { decodeCursor, encodeCursor, escapeLikeWildcards, pageLimit } from '../prisma/pagination';

/**
 * Lado de LECTURA de compras.
 *
 * El nombre del proveedor se resuelve con un join en lugar de guardarse en el documento, y
 * esa asimetria con las lineas es deliberada: el nombre del PRODUCTO se congela en la
 * linea porque describe lo que llego aquel dia, pero el proveedor es una referencia viva
 * — si cambia de razon social, lo util es ver la actual.
 */
class PrismaPurchasingQueries implements PurchasingQueries {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  suppliers(filter: {
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<Page<SupplierListItem>> {
    const limit = pageLimit(filter.limit);

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const cursor = decodeCursor(filter.cursor);
      const search = filter.search?.trim() ?? '';

      const rows = await tx.suppliers.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          tax_id: true,
          contact_name: true,
          phone: true,
          archived_at: true,
        },
        where: {
          tenant_id: this.ctx.tenantId,
          ...(filter.includeArchived !== true ? { archived_at: null } : {}),
          ...(search !== ''
            ? {
                // `contains` NO escapa los comodines: sin neutralizarlos, buscar "%"
                // devuelve la tabla entera. Comprobado contra la base.
                OR: [
                  { name: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                  { code: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                  { tax_id: { contains: escapeLikeWildcards(search), mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(cursor !== null
            ? {
                // El equivalente de `(name, id) > (sort, id)`. Prisma no expresa
                // comparacion de tuplas; esta forma con OR pide exactamente lo mismo y
                // sigue apoyandose en el indice (name, id).
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
        items: visible.map((row): SupplierListItem => ({
          id: row.id,
          code: row.code,
          name: row.name,
          taxId: row.tax_id,
          contactName: row.contact_name,
          phone: row.phone,
          archived: row.archived_at !== null,
        })),
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
      };
    });
  }

  supplierOptions(limit = 500): Promise<readonly SupplierOption[]> {
    return readOnly(this.prisma, this.ctx, (tx) =>
      tx.suppliers.findMany({
        select: { id: true, code: true, name: true },
        where: { tenant_id: this.ctx.tenantId, archived_at: null },
        orderBy: { name: 'asc' },
        take: pageLimit(limit),
      }),
    );
  }

  receipts(filter: { limit?: number }): Promise<Page<GoodsReceiptListItem>> {
    const limit = pageLimit(filter.limit);
    const currency = this.ctx.settings.baseCurrency;

    return readOnly(this.prisma, this.ctx, async (tx) => {
      // El conteo de lineas lo hace la base de datos, no se traen las lineas para
      // contarlas aqui. Para un listado de veinte recepciones eso serian veinte
      // documentos completos que nadie va a mirar.
      const rows = await tx.goods_receipts.findMany({
        select: {
          id: true,
          number: true,
          status: true,
          total_minor: true,
          received_at: true,
          suppliers: { select: { name: true } },
          _count: { select: { goods_receipt_lines: true } },
        },
        where: { tenant_id: this.ctx.tenantId },
        orderBy: { received_at: 'desc' },
        take: limit,
      });

      return {
        items: rows.map((row): GoodsReceiptListItem => ({
          id: row.id,
          number: row.number,
          status: row.status,
          supplierName: row.suppliers.name,
          total: Money.fromMinor(row.total_minor, currency).toString(),
          lineCount: row._count.goods_receipt_lines,
          receivedAt: row.received_at,
        })),
        nextCursor: null,
      };
    });
  }

  /**
   * Una recepcion con sus lineas.
   *
   * Dos consultas y no un join: con un join, cada linea repetiria la cabecera entera y
   * habria que deduplicarla aqui. Para un documento de cinco lineas eso es codigo de
   * agrupacion a cambio de ahorrar un viaje que dura microsegundos.
   */
  receiptById(id: string): Promise<GoodsReceiptView | null> {
    const currency = this.ctx.settings.baseCurrency;

    return readOnly(this.prisma, this.ctx, async (tx) => {
      const receipt = await tx.goods_receipts.findFirst({
        where: { tenant_id: this.ctx.tenantId, id },
        include: { suppliers: { select: { name: true, code: true } } },
      });

      if (receipt === null) return null;

      const lines = await tx.goods_receipt_lines.findMany({
        where: { tenant_id: this.ctx.tenantId, goods_receipt_id: id },
        orderBy: { line_no: 'asc' },
      });

      return {
        id: receipt.id,
        number: receipt.number,
        status: receipt.status,
        supplierName: receipt.suppliers.name,
        supplierCode: receipt.suppliers.code,
        total: Money.fromMinor(receipt.total_minor, currency).toString(),
        lineCount: lines.length,
        receivedAt: receipt.received_at,
        supplierReference: receipt.supplier_reference,
        notes: receipt.notes,
        voidReason: receipt.void_reason,
        lines: lines.map((line): GoodsReceiptLineView => ({
          lineNo: line.line_no,
          description: line.description_snapshot,
          unit: line.unit_snapshot,
          quantity: quantity(line.quantity),
          unitCost: Money.fromMinor(line.unit_cost_minor, currency).toString(),
          lineTotal: Money.fromMinor(line.line_total_minor, currency).toString(),
        })),
      };
    });
  }
}

export function prismaPurchasingQueries(
  prisma: PrismaClient,
  ctx: TenantContext,
): PurchasingQueries {
  return new PrismaPurchasingQueries(prisma, ctx);
}
