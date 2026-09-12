import type { Customer, CustomerId, TenantId } from '@corebiz/domain';
import { Prisma } from '@corebiz/prisma-client';
import type { CustomerRepository, ListCustomersFilter, Page } from '@corebiz/application';
import { fromCustomer, toCustomer } from './mappers';
import { decodeCursor, encodeCursor, escapeLikeWildcards, pageLimit } from './pagination';
import { isRowKey } from './record-id';
import type { Tx } from './session';

/**
 * Repositorio de clientes sobre Postgres.
 *
 * DEFENSA EN PROFUNDIDAD: todas las consultas filtran por `tenant_id` de forma explicita
 * aunque las politicas RLS ya lo hagan. Es redundante a proposito. Si alguien desactivara
 * una politica por error, el filtro del repositorio sigue conteniendo la fuga. Ver
 * docs/adr/005-aislamiento-multi-tenant.md.
 */
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: CustomerId): Promise<Customer | null> {
    if (!isRowKey(id)) return null;

    const row = await this.tx.customers.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    return row === null ? null : toCustomer(row);
  }

  async findByCode(code: string): Promise<Customer | null> {
    // El dominio guarda el codigo normalizado; buscar sin normalizar daria un falso
    // negativo y, con el, un duplicado que la restriccion unica rechaza despues con un
    // error mucho menos claro.
    const normalized = code.trim().toUpperCase();

    const row = await this.tx.customers.findFirst({
      where: { tenant_id: this.tenantId, code: normalized },
    });
    return row === null ? null : toCustomer(row);
  }

  async list(filter: ListCustomersFilter): Promise<Page<Customer>> {
    const limit = pageLimit(filter.limit);
    const search = filter.search?.trim() ?? '';

    // Paginacion por keyset, no por OFFSET: con OFFSET, Postgres tiene que recorrer y
    // descartar todas las filas anteriores, asi que la pagina 200 es mucho mas lenta que
    // la primera.
    //
    // La comparacion de tuplas `(name, id) > (...)` no existe en Prisma; el OR de dos
    // ramas pide lo mismo y usa el mismo indice que el ORDER BY. La segunda rama no
    // sobra: sin ella, dos clientes con el mismo nombre harian que la paginacion se
    // saltase uno.
    const cursor = decodeCursor(filter.cursor);

    // Se pide una fila de mas para saber si hay pagina siguiente sin tener que contar el
    // total, que seria un escaneo completo en cada listado.
    const rows = await this.tx.customers.findMany({
      where: {
        tenant_id: this.tenantId,
        ...(filter.includeArchived !== true ? { archived_at: null } : {}),
        ...(search !== ''
          ? {
              // El termino se escapa antes: `contains` de Prisma NO neutraliza los
              // comodines, asi que un "%" suelto traeria la tabla entera.
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
      items: visible.map(toCustomer),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.name, last.id) : null,
    };
  }

  async save(customer: Customer): Promise<void> {
    const row = fromCustomer(customer);

    await this.tx.customers.upsert({
      where: { id: row.id },
      create: row,
      // `updated_at` no se toca: lo pone un trigger. Y `tenant_id` tampoco, porque
      // cambiarlo seria mover el cliente a otra empresa.
      //
      // Los `?? null` no son ruido: los campos opcionales de Prisma se declaran
      // `campo?: T | null`, y con `exactOptionalPropertyTypes` un `undefined` no encaja
      // ahi. Pero ademas significan cosas distintas — Prisma OMITE lo indefinido, asi que
      // dejarlo pasar no borraria un correo, lo dejaria como estaba. Aqui se quiere lo
      // contrario: guardar el agregado tal y como el dominio lo dejo.
      update: {
        code: row.code,
        name: row.name,
        tax_id: row.tax_id ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        address: row.address ?? Prisma.DbNull,
        credit_limit_minor: row.credit_limit_minor ?? null,
        credit_limit_currency: row.credit_limit_currency ?? null,
        archived_at: row.archived_at ?? null,
      },
    });
  }

  async delete(id: CustomerId): Promise<void> {
    await this.tx.customers.deleteMany({ where: { tenant_id: this.tenantId, id } });
  }

  async hasDocuments(id: CustomerId): Promise<boolean> {
    // Se comprueba antes de borrar para poder dar un mensaje util. La base de datos lo
    // impide igualmente con una clave foranea diferida: esto es la cortesia, aquella es la
    // garantia.
    const total = await this.tx.delivery_notes.count({
      where: { tenant_id: this.tenantId, customer_id: id },
    });

    return total > 0;
  }
}
