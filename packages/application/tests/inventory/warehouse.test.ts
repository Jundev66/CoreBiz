import { describe, expect, it } from 'vitest';
import { InMemoryWarehouseRepository } from '../../src/adapters/memory/inventory';
import { CreateWarehouseCommandHandler } from '../../src/inventory/commands/create-warehouse.command';
import { ListWarehousesQueryHandler } from '../../src/inventory/queries/list-warehouses.query';
import { Warehouse } from '@corebiz/domain';

describe('Warehouse Aggregate & Use Cases', () => {
  it('creates a warehouse successfully', async () => {
    const repo = new InMemoryWarehouseRepository();
    const handler = new CreateWarehouseCommandHandler(repo);

    const result = await handler.execute({
      id: 'wh-1',
      tenantId: 'tenant-alpha',
      code: 'MAIN',
      name: 'Main Central Hub',
      address: 'Zone 1 Industrial Park',
      isDefault: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.warehouseId).toBe('wh-1');

    const created = await repo.findById('tenant-alpha', 'wh-1');
    expect(created).not.toBeNull();
    expect(created?.code).toBe('MAIN');
    expect(created?.name).toBe('Main Central Hub');
    expect(created?.isDefault).toBe(true);
    expect(created?.isActive).toBe(true);
  });

  it('rejects duplicate warehouse code within the same tenant', async () => {
    const repo = new InMemoryWarehouseRepository();
    const handler = new CreateWarehouseCommandHandler(repo);

    await handler.execute({
      id: 'wh-1',
      tenantId: 'tenant-alpha',
      code: 'MAIN',
      name: 'Main Central Hub',
    });

    const duplicateResult = await handler.execute({
      id: 'wh-2',
      tenantId: 'tenant-alpha',
      code: 'main',
      name: 'Duplicate Hub',
    });

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) return;

    expect(duplicateResult.error.kind).toBe('WarehouseCodeAlreadyExists');
  });

  it('allows identical warehouse codes across different tenants', async () => {
    const repo = new InMemoryWarehouseRepository();
    const handler = new CreateWarehouseCommandHandler(repo);

    const res1 = await handler.execute({
      id: 'wh-1',
      tenantId: 'tenant-alpha',
      code: 'MAIN',
      name: 'Alpha Main',
    });

    const res2 = await handler.execute({
      id: 'wh-2',
      tenantId: 'tenant-beta',
      code: 'MAIN',
      name: 'Beta Main',
    });

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
  });

  it('automatically demotes existing default warehouse when setting a new default', async () => {
    const repo = new InMemoryWarehouseRepository();
    const handler = new CreateWarehouseCommandHandler(repo);

    await handler.execute({
      id: 'wh-1',
      tenantId: 'tenant-alpha',
      code: 'WH-01',
      name: 'Warehouse 1',
      isDefault: true,
    });

    const firstDefault = await repo.findById('tenant-alpha', 'wh-1');
    expect(firstDefault?.isDefault).toBe(true);

    await handler.execute({
      id: 'wh-2',
      tenantId: 'tenant-alpha',
      code: 'WH-02',
      name: 'Warehouse 2',
      isDefault: true,
    });

    const updatedFirst = await repo.findById('tenant-alpha', 'wh-1');
    const newSecond = await repo.findById('tenant-alpha', 'wh-2');

    expect(updatedFirst?.isDefault).toBe(false);
    expect(newSecond?.isDefault).toBe(true);
  });

  it('allows activating and deactivating warehouses', () => {
    const createRes = Warehouse.create({
      id: 'wh-1',
      tenantId: 'tenant-alpha',
      code: 'AUX',
      name: 'Auxiliary Depot',
    });

    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    const activeWh = createRes.value;
    expect(activeWh.isActive).toBe(true);

    const deactivated = activeWh.deactivate();
    expect(deactivated.isActive).toBe(false);

    const reactivated = deactivated.activate();
    expect(reactivated.isActive).toBe(true);
  });

  it('enforces multi-tenant isolation when listing warehouses', async () => {
    const repo = new InMemoryWarehouseRepository();
    const handler = new CreateWarehouseCommandHandler(repo);
    const queryHandler = new ListWarehousesQueryHandler(repo);

    await handler.execute({
      id: 'wh-a',
      tenantId: 'tenant-a',
      code: 'ALPHA-01',
      name: 'Alpha Warehouse',
    });

    await handler.execute({
      id: 'wh-b',
      tenantId: 'tenant-b',
      code: 'BETA-01',
      name: 'Beta Warehouse',
    });

    const listA = await queryHandler.execute({ tenantId: 'tenant-a' });
    const listB = await queryHandler.execute({ tenantId: 'tenant-b' });

    expect(listA.length).toBe(1);
    expect(listA[0]?.id).toBe('wh-a');

    expect(listB.length).toBe(1);
    expect(listB[0]?.id).toBe('wh-b');
  });
});
