import type { GoodsReceipt, Supplier, SupplierId } from '@corebiz/domain';
import type { Page } from './page';

/**
 * Puertos del modulo de compras.
 *
 * Misma forma que los de venta, y por la misma razon: quien escribe necesita el
 * agregado con sus invariantes. El lado de lectura vive aparte, en
 * `queries/read-models.ts`, y devuelve datos planos.
 *
 * Ninguna firma recibe `tenantId`. El contexto se inyecta al construir el Unit
 * of Work, de modo que un caso de uso no puede olvidarlo ni elegir otro.
 */

export interface SupplierRepository {
  findById(id: SupplierId): Promise<Supplier | null>;
  findByCode(code: string): Promise<Supplier | null>;
  list(filter: { search?: string; limit?: number; cursor?: string }): Promise<Page<Supplier>>;
  save(supplier: Supplier): Promise<void>;
}

export interface GoodsReceiptRepository {
  findById(id: string): Promise<GoodsReceipt | null>;
  findByNumber(number: string): Promise<GoodsReceipt | null>;
  list(filter: { supplierId?: string; limit?: number }): Promise<Page<GoodsReceipt>>;
  save(receipt: GoodsReceipt): Promise<void>;
}
