import 'server-only';
import { Customer, Money, asId, type CustomerId, type TenantId } from '@corebiz/domain';
import type { Page, ListCustomersFilter } from '@corebiz/application';
import { InMemoryUnitOfWork, InMemoryCustomerRepository } from '@corebiz/application';

/**
 * Almacen en memoria para `pnpm dev:nodb`.
 *
 * Vive en `globalThis` a proposito: la recarga en caliente de Next recrea los modulos
 * en cada cambio, y sin esto los datos que acabas de introducir desaparecerian al
 * guardar un archivo. Es una molestia clasica del desarrollo con estado en memoria.
 */

export const MEMORY_TENANT = asId<TenantId>('00000000-0000-0000-0000-0000000000t1');

interface MemoryStore {
  customers: Map<string, Customer>;
  usage: Map<string, number>;
  seeded: boolean;
}

const globalForMemory = globalThis as unknown as { __corebizMemory?: MemoryStore };

function store(): MemoryStore {
  globalForMemory.__corebizMemory ??= {
    customers: new Map(),
    usage: new Map(),
    seeded: false,
  };
  const current = globalForMemory.__corebizMemory;
  if (!current.seeded) {
    seed(current);
    current.seeded = true;
  }
  return current;
}

/** Datos de ejemplo con aspecto de comercio real, no "Cliente 1, Cliente 2". */
const SAMPLE: readonly (readonly [string, string, string, string | null])[] = [
  ['CLI-001', 'Bodega La Esquina', 'J-30456789-1', '1500.00'],
  ['CLI-002', 'Panaderia Santa Rosa', 'J-31122334-5', '800.00'],
  ['CLI-003', 'Ferreteria El Tornillo', 'J-29887766-0', '3000.00'],
  ['CLI-004', 'Farmacia San Jose', 'J-30111222-3', null],
  ['CLI-005', 'Licoreria El Brindis', 'J-31998877-6', '2200.00'],
  ['CLI-006', 'Charcuteria Los Andes', 'J-30554433-2', '950.00'],
  ['CLI-007', 'Supermercado Mi Barrio', 'J-29334455-7', '5000.00'],
  ['CLI-008', 'Restaurante Doña Carmen', 'J-31667788-4', '1200.00'],
];

function seed(target: MemoryStore): void {
  const createdAt = new Date('2026-01-15T10:00:00.000Z');
  let index = 0;

  for (const [code, name, taxId, creditLimit] of SAMPLE) {
    index += 1;
    const limit = creditLimit ? Money.of(creditLimit, 'USD') : null;
    const created = Customer.create({
      id: asId<CustomerId>(`00000000-0000-0000-0000-00000000c${index.toString().padStart(3, '0')}`),
      tenantId: MEMORY_TENANT,
      code,
      name,
      taxId,
      email: `contacto@${code.toLowerCase()}.ve`,
      creditLimit: limit?.ok ? limit.value : null,
      createdAt,
    });
    if (created.ok) {
      created.value.pullDomainEvents();
      target.customers.set(created.value.id, created.value);
    }
  }

  target.usage.set(`${MEMORY_TENANT}:customers`, target.customers.size);
}

export function getMemoryUnitOfWork(tenantId: TenantId): InMemoryUnitOfWork {
  const current = store();
  return new InMemoryUnitOfWork(current.customers, current.usage, tenantId);
}

/** Lectura directa para los Server Components (lado consulta del CQRS ligero). */
export function memoryCustomerQueries(tenantId: TenantId) {
  const current = store();
  const repo = new InMemoryCustomerRepository(current.customers, tenantId);
  return {
    list: (filter: ListCustomersFilter): Promise<Page<Customer>> => repo.list(filter),
    usage: (resource: string): number => current.usage.get(`${tenantId}:${resource}`) ?? 0,
  };
}
