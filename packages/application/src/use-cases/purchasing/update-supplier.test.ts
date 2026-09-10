import { describe, it, expect, beforeEach } from 'vitest';
import { asId, Plan, type Supplier, type TenantId } from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  InMemoryAuditLogger,
  createSalesStores,
  makeTestContext,
  type SalesStores,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeCreateSupplier } from './create-supplier';
import { makeUpdateSupplier } from './update-supplier';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('updateSupplier', () => {
  let stores: SalesStores;
  let audit: InMemoryAuditLogger;
  let uow: InMemoryUnitOfWork;

  const build = (ctx = makeTestContext()) => {
    audit = new InMemoryAuditLogger(TENANT);
    uow = new InMemoryUnitOfWork(stores, stores.usage, TENANT, audit);
    return {
      createSupplier: makeCreateSupplier({
        uow,
        ctx,
        clock: fixedClock(NOW),
        ids: sequentialIdGenerator('sup'),
      }),
      updateSupplier: makeUpdateSupplier({ uow, ctx }),
    };
  };

  beforeEach(() => {
    stores = createSalesStores();
  });

  /** El agregado guardado. `SalesStores` los tiene como `unknown` a proposito. */
  const guardado = (id: string): Supplier => stores.suppliers.get(id) as Supplier;

  const alta = async (
    createSupplier: ReturnType<typeof makeCreateSupplier>,
    input: Parameters<ReturnType<typeof makeCreateSupplier>>[0] = {
      name: 'Distribuidora del Centro',
    },
  ) => {
    const creado = await createSupplier(input);
    if (!creado.ok) throw new Error('el alta deberia haber funcionado');
    return creado.value;
  };

  it('corrige el nombre sin cambiar el codigo', async () => {
    const { createSupplier, updateSupplier } = build();
    const { id, code } = await alta(createSupplier);

    const result = await updateSupplier({ supplierId: id, name: 'Distribuidora del Este' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe(code);
    expect(guardado(id).name).toBe('Distribuidora del Este');
  });

  it('vacia los campos que llegan en blanco', async () => {
    const { createSupplier, updateSupplier } = build();
    const { id } = await alta(createSupplier, {
      name: 'Distribuidora del Centro',
      contactName: 'Maria Perez',
      phone: '0241-5551234',
    });

    await updateSupplier({ supplierId: id, name: 'Distribuidora del Centro' });

    expect(guardado(id).contactName).toBeNull();
    expect(guardado(id).phone).toBeNull();
  });

  it('un email invalido se rechaza y no guarda nada', async () => {
    const { createSupplier, updateSupplier } = build();
    const { id } = await alta(createSupplier, {
      name: 'Distribuidora del Centro',
      phone: '0241-5551234',
    });

    const result = await updateSupplier({
      supplierId: id,
      name: 'Distribuidora del Centro',
      email: 'roto',
      phone: '0000',
    });

    expect(result.ok).toBe(false);
    expect(guardado(id).phone).toBe('0241-5551234');
  });

  it('un proveedor ARCHIVADO se puede seguir editando', async () => {
    // Archivar oculta, no congela. Corregir el telefono de alguien con quien se dejo
    // de trabajar es justo lo que hace falta el dia que se le vuelve a llamar.
    const { createSupplier, updateSupplier } = build();
    const { id } = await alta(createSupplier);
    guardado(id).archive(NOW);

    const result = await updateSupplier({
      supplierId: id,
      name: 'Distribuidora del Centro',
      phone: '0241-1112233',
    });

    expect(result.ok).toBe(true);
    expect(guardado(id).phone).toBe('0241-1112233');
    expect(guardado(id).isArchived).toBe(true);
  });

  it('registra en auditoria solo lo que cambio', async () => {
    const { createSupplier, updateSupplier } = build();
    const { id } = await alta(createSupplier, {
      name: 'Distribuidora del Centro',
      contactName: 'Maria Perez',
    });

    await updateSupplier({
      supplierId: id,
      name: 'Distribuidora del Centro',
      contactName: 'Jose Ramirez',
    });

    const entrada = audit.entries.find((e) => e.action === 'supplier.updated');
    expect(entrada?.diff).toEqual({
      contactName: { de: 'Maria Perez', a: 'Jose Ramirez' },
    });
  });

  it('un proveedor que no existe responde NotFound', async () => {
    const { updateSupplier } = build();

    const result = await updateSupplier({ supplierId: 'no-existe', name: 'Nadie' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('SupplierNotFound');
  });

  it('sin permiso de escritura no toca nada', async () => {
    const { createSupplier } = build();
    const { id } = await alta(createSupplier);

    const soloLectura = makeTestContext({ actor: { userId: asId('u-1'), role: 'viewer' } });
    const updateSupplier = makeUpdateSupplier({ uow, ctx: soloLectura });

    const result = await updateSupplier({ supplierId: id, name: 'Otro nombre' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('Forbidden');
    expect(guardado(id).name).toBe('Distribuidora del Centro');
  });

  it('el gate de compras existe y con el plan actual no bloquea a nadie', async () => {
    // El gate `plan.has('purchasing')` sigue en el codigo aunque el modelo freemium se
    // retirara. Este test afirma lo que de verdad ocurre hoy —un unico plan que lo
    // incluye todo, asi que compras esta siempre disponible— y no lo que ocurriria con
    // otra definicion de plan. Un test que fingiera un limite ya retirado enseñaria una
    // regla que el sistema no aplica.
    const { createSupplier } = build();
    const { id } = await alta(createSupplier);

    const conPlanBasico = makeTestContext({ plan: Plan.of('free') });
    const updateSupplier = makeUpdateSupplier({ uow, ctx: conPlanBasico });

    const result = await updateSupplier({ supplierId: id, name: 'Otro nombre' });

    expect(result.ok).toBe(true);
  });
});
