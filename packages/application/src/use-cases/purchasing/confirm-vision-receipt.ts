import {
  ok,
  err,
  can,
  asId,
  GoodsReceipt,
  Money,
  Product,
  Quantity,
  Supplier,
  type Result,
  type FeatureError,
  type GoodsReceiptError,
  type ProductId,
  type ProductError,
  type SupplierId,
  type SupplierError,
  type QuotaError,
} from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import { periodOf } from '../period';

export interface ConfirmVisionReceiptInput {
  readonly supplierDecision:
    | { readonly mode: 'existing'; readonly supplierId: string }
    | {
        readonly mode: 'create';
        readonly name: string;
        readonly taxId?: string | null | undefined;
      };
  readonly linesDecision: readonly {
    readonly mode: 'existing' | 'create';
    readonly productId?: string | undefined;
    readonly name?: string | undefined;
    readonly sku?: string | null | undefined;
    readonly unit?: string | undefined;
    readonly quantity: string;
    readonly unitCost?: string | null | undefined;
  }[];
  readonly documentMetadata?:
    | {
        readonly filename?: string | null | undefined;
        readonly documentHash?: string | null | undefined;
        readonly supplierReference?: string | null | undefined;
        readonly notes?: string | null | undefined;
      }
    | undefined;
}

export type ConfirmVisionReceiptError =
  | { kind: 'Forbidden' }
  | { kind: 'SupplierNotFound'; supplierId: string }
  | { kind: 'ProductNotFound'; productId: string }
  | { kind: 'DuplicateSku'; sku: string }
  | { kind: 'InvalidQuantity'; productId?: string; raw: string }
  | { kind: 'InvalidCost'; productId?: string; raw: string }
  | { kind: 'NoLines' }
  | FeatureError
  | QuotaError
  | SupplierError
  | ProductError
  | GoodsReceiptError;

export interface ConfirmVisionReceiptOutput {
  readonly id: string;
  readonly number: string;
  readonly total: string;
  readonly supplierName: string;
  readonly createdSupplier: boolean;
  readonly createdProductsCount: number;
}

export interface ConfirmVisionReceiptDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function makeConfirmVisionReceipt(deps: ConfirmVisionReceiptDeps) {
  return async function confirmVisionReceipt(
    input: ConfirmVisionReceiptInput,
  ): Promise<Result<ConfirmVisionReceiptOutput, ConfirmVisionReceiptError>> {
    const gate = deps.ctx.plan.checkFeature('purchasing');
    if (!gate.ok) return gate;

    if (!can(deps.ctx.actor, 'purchase:receive')) {
      return err({ kind: 'Forbidden' });
    }

    if (input.linesDecision.length === 0) {
      return err({ kind: 'NoLines' });
    }

    const currency = deps.ctx.settings.baseCurrency;

    return deps.uow.run(async (repos) => {
      // 1. Validar cuota de documentos mensuales
      const docUsage = await repos.usage.current('documents_month');
      const docQuota = deps.ctx.plan.checkQuota('documents_month', docUsage);
      if (!docQuota.ok) return docQuota;

      // 2. Resolver o dar de alta el Proveedor
      let supplier: Supplier;
      let createdSupplier = false;

      if (input.supplierDecision.mode === 'create') {
        if (!can(deps.ctx.actor, 'supplier:write')) {
          return err({ kind: 'Forbidden' });
        }

        const supUsage = await repos.usage.current('suppliers');
        const supQuota = deps.ctx.plan.checkQuota('suppliers', supUsage);
        if (!supQuota.ok) return supQuota;

        const code = await repos.sequences.next('supplier', periodOf(deps.clock.now()));
        const createdSup = Supplier.create({
          id: asId<SupplierId>(deps.ids.next()),
          tenantId: deps.ctx.tenantId,
          code,
          name: input.supplierDecision.name,
          taxId: input.supplierDecision.taxId ?? null,
          createdAt: deps.clock.now(),
        });
        if (!createdSup.ok) return createdSup;

        supplier = createdSup.value;
        await repos.suppliers.save(supplier);
        await repos.usage.increment('suppliers');
        createdSupplier = true;
      } else {
        const existingSup = await repos.suppliers.findById(
          asId<SupplierId>(input.supplierDecision.supplierId),
        );
        if (!existingSup) {
          return err({
            kind: 'SupplierNotFound',
            supplierId: input.supplierDecision.supplierId,
          });
        }
        supplier = existingSup;
      }

      // 3. Resolver y/o dar de alta productos en catálogo
      const productsMap = new Map<string, Product>();
      let createdProductsCount = 0;

      // Cargar productos existentes necesarios
      const existingProductIds = input.linesDecision
        .filter((l) => l.mode === 'existing' && l.productId)
        .map((l) => asId<ProductId>(l.productId!));

      if (existingProductIds.length > 0) {
        const found = await repos.products.findManyByIds(existingProductIds);
        for (const p of found) {
          productsMap.set(p.id, p);
        }
      }

      // Procesar y crear los nuevos productos aprobados
      for (const line of input.linesDecision) {
        if (line.mode === 'create') {
          if (!can(deps.ctx.actor, 'product:write')) {
            return err({ kind: 'Forbidden' });
          }

          const prodUsage = await repos.usage.current('products');
          const prodQuota = deps.ctx.plan.checkQuota('products', prodUsage);
          if (!prodQuota.ok) return prodQuota;

          const typedSku = (line.sku ?? '').trim().toUpperCase();
          if (typedSku !== '') {
            const existing = await repos.products.findBySku(typedSku);
            if (existing) return err({ kind: 'DuplicateSku', sku: typedSku });
          }

          const sku =
            typedSku === ''
              ? await repos.sequences.next('product', periodOf(deps.clock.now()))
              : typedSku;

          const unitCostRaw = line.unitCost && line.unitCost.trim() !== '' ? line.unitCost : '0';
          const costMoney = Money.of(unitCostRaw, currency);
          if (!costMoney.ok) return err({ kind: 'InvalidCost', raw: unitCostRaw });

          const createdProd = Product.create({
            id: asId<ProductId>(deps.ids.next()),
            tenantId: deps.ctx.tenantId,
            sku,
            name: line.name && line.name.trim() !== '' ? line.name.trim() : 'Producto sin nombre',
            price: costMoney.value, // Precio de venta inicial alineado al costo de compra
            cost: costMoney.value,
            unit: line.unit && line.unit.trim() !== '' ? line.unit.trim() : 'unidad',
            trackStock: true,
            createdAt: deps.clock.now(),
          });
          if (!createdProd.ok) return createdProd;

          const newProduct = createdProd.value;
          await repos.products.save(newProduct);
          await repos.usage.increment('products');
          productsMap.set(newProduct.id, newProduct);
          createdProductsCount++;
        }
      }

      // 4. Armar los renglones de la recepción de mercancía
      const receiptLines: Parameters<typeof GoodsReceipt.receive>[0]['lines'][number][] = [];

      for (const line of input.linesDecision) {
        const targetProductId =
          line.mode === 'create'
            ? [...productsMap.values()].find((p) => p.name === line.name?.trim())?.id
            : line.productId;

        if (!targetProductId) {
          return err({ kind: 'ProductNotFound', productId: line.productId ?? 'unknown' });
        }

        const product = productsMap.get(targetProductId);
        if (!product) {
          return err({ kind: 'ProductNotFound', productId: targetProductId });
        }

        const quantity = Quantity.positive(line.quantity);
        if (!quantity.ok) {
          return err({ kind: 'InvalidQuantity', productId: product.id, raw: line.quantity });
        }

        let unitCostMoney: Money;
        if (line.unitCost !== undefined && line.unitCost !== null && line.unitCost.trim() !== '') {
          const parsed = Money.of(line.unitCost, currency);
          if (!parsed.ok) {
            return err({ kind: 'InvalidCost', productId: product.id, raw: line.unitCost });
          }
          unitCostMoney = parsed.value;
        } else if (product.cost !== null) {
          unitCostMoney = product.cost;
        } else {
          return err({
            kind: 'InvalidCost',
            productId: product.id,
            raw: line.unitCost ?? '',
          });
        }

        receiptLines.push({
          product: {
            id: product.id,
            name: product.name,
            unit: product.unit,
            trackStock: product.trackStock,
          },
          quantity: quantity.value,
          unitCost: unitCostMoney,
        });
      }

      if (receiptLines.length === 0) {
        return err({ kind: 'NoLines' });
      }

      // 5. Emitir la recepción de mercancía (GoodsReceipt)
      const number = await repos.sequences.next('goods_receipt');

      // Trazabilidad enriquecida en las notas
      const traceNotes = [
        input.documentMetadata?.notes?.trim(),
        input.documentMetadata?.filename
          ? `Comprobante escaneado: ${input.documentMetadata.filename}`
          : null,
        input.documentMetadata?.documentHash
          ? `Hash SHA-256: ${input.documentMetadata.documentHash.slice(0, 16)}...`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const createdReceipt = GoodsReceipt.receive({
        id: deps.ids.next(),
        tenantId: deps.ctx.tenantId,
        number,
        supplierId: supplier.id,
        currency,
        lines: receiptLines,
        supplierReference: input.documentMetadata?.supplierReference ?? null,
        notes: traceNotes !== '' ? traceNotes : null,
        receivedAt: deps.clock.now(),
        receivedBy: deps.ctx.actor.userId,
      });
      if (!createdReceipt.ok) return createdReceipt;

      const receipt = createdReceipt.value;

      // 6. Impactar inventario de cada producto mediante Product.addStock
      for (const entry of receipt.stockEntries) {
        const product = productsMap.get(entry.productId);
        if (!product) continue;

        const added = product.addStock(entry.quantity, deps.clock.now(), {
          type: 'goods_receipt',
          id: receipt.id,
        });
        if (!added.ok) return added;
      }

      // 7. Persistir todo atómicamente
      await repos.goodsReceipts.save(receipt);
      await repos.products.saveMany([...productsMap.values()]);
      await repos.usage.increment('documents_month');

      // 8. Registro de auditoría con trazabilidad de origen
      await repos.audit.record({
        action: 'goods_receipt.received',
        entityType: 'goods_receipt',
        entityId: receipt.id,
        summary: {
          number: receipt.number,
          supplier: supplier.name,
          total: receipt.total.toString(),
          lines: receipt.lines.length,
          source: 'synapse_vision',
          filename: input.documentMetadata?.filename ?? null,
          documentHash: input.documentMetadata?.documentHash ?? null,
          createdSupplier,
          createdProductsCount,
        },
      });

      return ok({
        id: receipt.id,
        number: receipt.number,
        total: receipt.total.toString(),
        supplierName: supplier.name,
        createdSupplier,
        createdProductsCount,
      });
    });
  };
}
