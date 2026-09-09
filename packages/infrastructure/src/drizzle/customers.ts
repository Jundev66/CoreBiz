import { and, asc, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { Customer, CustomerId, TenantId } from '@corebiz/domain';
import type { CustomerRepository, ListCustomersFilter, Page } from '@corebiz/application';
import { fromCustomer, toCustomer } from './mappers';
import { decodeCursor, encodeCursor, likePattern, pageLimit } from '../prisma/pagination';
import type { Tx } from './tx';

const { customers, deliveryNotes } = schema;

/**
 * Repositorio de clientes sobre Postgres.
 *
 * DEFENSA EN PROFUNDIDAD: todas las consultas filtran por `tenant_id` de forma
 * explicita aunque las politicas RLS ya lo hagan. Es redundante a proposito. Si
 * alguien desactivara una politica por error, el filtro del repositorio sigue
 * conteniendo la fuga. Ver docs/adr/005-aislamiento-multi-tenant.md.
 */
export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    const rows = await this.tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), eq(customers.id, id)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

  async findByCode(code: string): Promise<Customer | null> {
    // El dominio guarda el codigo normalizado; buscar sin normalizar daria un
    // falso negativo y, con el, un duplicado que la restriccion unica rechaza
    // despues con un error mucho menos claro.
    const normalized = code.trim().toUpperCase();

    const rows = await this.tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), eq(customers.code, normalized)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

  async list(filter: ListCustomersFilter): Promise<Page<Customer>> {
    const limit = pageLimit(filter.limit);
    const conditions = [eq(customers.tenantId, this.tenantId)];

    if (filter.includeArchived !== true) {
      conditions.push(isNull(customers.archivedAt));
    }

    if (filter.search !== undefined && filter.search.trim() !== '') {
      const pattern = likePattern(filter.search);
      const match = or(
        ilike(customers.name, pattern),
        ilike(customers.code, pattern),
        ilike(customers.taxId, pattern),
      );
      if (match !== undefined) conditions.push(match);
    }

    // Paginacion por keyset, no por OFFSET: con OFFSET, Postgres tiene que
    // recorrer y descartar todas las filas anteriores, asi que la pagina 200 es
    // mucho mas lenta que la primera. La comparacion de tuplas usa el mismo
    // indice que el ORDER BY.
    const cursor = decodeCursor(filter.cursor);
    if (cursor !== null) {
      conditions.push(sql`(${customers.name}, ${customers.id}) > (${cursor.sort}, ${cursor.id})`);
    }

    // Se pide una fila de mas para saber si hay pagina siguiente sin tener que
    // contar el total, que seria un escaneo completo en cada listado.
    const rows = await this.tx
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];

    return {
      items: visible.map(toCustomer),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
    };
  }

  async save(customer: Customer): Promise<void> {
    const row = fromCustomer(customer);

    await this.tx
      .insert(customers)
      .values(row)
      .onConflictDoUpdate({
        target: customers.id,
        // `updated_at` no se toca: lo pone un trigger. Y `tenant_id` tampoco,
        // porque cambiarlo seria mover el cliente a otra empresa.
        set: {
          code: row.code,
          name: row.name,
          taxId: row.taxId,
          email: row.email,
          phone: row.phone,
          address: row.address,
          creditLimitMinor: row.creditLimitMinor,
          creditLimitCurrency: row.creditLimitCurrency,
          archivedAt: row.archivedAt,
        },
      });
  }

  async delete(id: CustomerId): Promise<void> {
    await this.tx
      .delete(customers)
      .where(and(eq(customers.tenantId, this.tenantId), eq(customers.id, id)));
  }

  async hasDocuments(id: CustomerId): Promise<boolean> {
    // Se comprueba antes de borrar para poder dar un mensaje util. La base de
    // datos lo impide igualmente con una clave foranea diferida: esto es la
    // cortesia, aquella es la garantia.
    const rows = await this.tx
      .select({ total: count() })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.tenantId, this.tenantId), eq(deliveryNotes.customerId, id)));

    return (rows[0]?.total ?? 0) > 0;
  }
}
