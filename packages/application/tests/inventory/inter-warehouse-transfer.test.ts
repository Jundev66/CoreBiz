import { describe, expect, it } from 'vitest';
import { Quantity } from '@corebiz/shared-kernel';
import {
  InMemoryWarehouseRepository,
  InMemoryTransferRepository,
} from '../../src/adapters/memory/inventory';
import { CreateWarehouseCommandHandler } from '../../src/inventory/commands/create-warehouse.command';
import { InitiateTransferCommandHandler } from '../../src/inventory/commands/initiate-transfer.command';
import { ReceiveTransferCommandHandler } from '../../src/inventory/commands/receive-transfer.command';
import { CancelTransferCommandHandler } from '../../src/inventory/commands/cancel-transfer.command';
import { GetWarehouseStockQueryHandler } from '../../src/inventory/queries/get-warehouse-stock.query';
import { ListTransfersQueryHandler } from '../../src/inventory/queries/list-transfers.query';

describe('Inter-Warehouse Transfers Lifecycle & Inventory Invariants', () => {
  it('completes the full transfer lifecycle: initiate, reserve stock, receive and increase destination stock', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);
    const receiveTransfer = new ReceiveTransferCommandHandler(transferRepo, warehouseRepo);
    const getStock = new GetWarehouseStockQueryHandler(warehouseRepo);

    await createWh.execute({
      id: 'wh-source',
      tenantId: 'tenant-alpha',
      code: 'CENTRAL',
      name: 'Central Warehouse',
    });
    await createWh.execute({
      id: 'wh-dest',
      tenantId: 'tenant-alpha',
      code: 'BRANCH-1',
      name: 'Branch 1 Warehouse',
    });

    const qtyInitRes = Quantity.of(100);
    expect(qtyInitRes.ok).toBe(true);
    if (!qtyInitRes.ok) return;

    warehouseRepo.setStock('tenant-alpha', 'wh-source', 'prod-item-1', qtyInitRes.value);

    const sourceStockBefore = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-source',
      productId: 'prod-item-1',
    });
    expect(sourceStockBefore.toString()).toBe('100.000');

    const initiateRes = await initiateTransfer.execute({
      id: 'trf-1',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-source',
      destinationWarehouseId: 'wh-dest',
      notes: 'Replenishment for Branch 1',
      lines: [{ productId: 'prod-item-1', quantity: 30 }],
    });

    expect(initiateRes.ok).toBe(true);
    if (!initiateRes.ok) return;

    expect(initiateRes.value.status).toBe('IN_TRANSIT');
    expect(initiateRes.value.transferNumber).toBe('TRF-000001');

    const sourceStockInTransit = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-source',
      productId: 'prod-item-1',
    });
    expect(sourceStockInTransit.toString()).toBe('70.000');

    const destStockBeforeReceive = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-dest',
      productId: 'prod-item-1',
    });
    expect(destStockBeforeReceive.toString()).toBe('0.000');

    const receiveRes = await receiveTransfer.execute({
      tenantId: 'tenant-alpha',
      transferId: 'trf-1',
    });

    expect(receiveRes.ok).toBe(true);
    if (!receiveRes.ok) return;

    expect(receiveRes.value.status).toBe('COMPLETED');

    const destStockAfterReceive = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-dest',
      productId: 'prod-item-1',
    });
    expect(destStockAfterReceive.toString()).toBe('30.000');
  });

  it('cancels transfer and restores reserved stock to source warehouse', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);
    const cancelTransfer = new CancelTransferCommandHandler(transferRepo, warehouseRepo);
    const getStock = new GetWarehouseStockQueryHandler(warehouseRepo);

    await createWh.execute({
      id: 'wh-source',
      tenantId: 'tenant-alpha',
      code: 'SRC',
      name: 'Source Warehouse',
    });
    await createWh.execute({
      id: 'wh-dest',
      tenantId: 'tenant-alpha',
      code: 'DST',
      name: 'Destination Warehouse',
    });

    const qtyInitRes = Quantity.of(50);
    expect(qtyInitRes.ok).toBe(true);
    if (!qtyInitRes.ok) return;

    warehouseRepo.setStock('tenant-alpha', 'wh-source', 'prod-x', qtyInitRes.value);

    await initiateTransfer.execute({
      id: 'trf-2',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-source',
      destinationWarehouseId: 'wh-dest',
      lines: [{ productId: 'prod-x', quantity: 20 }],
    });

    const stockDeducted = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-source',
      productId: 'prod-x',
    });
    expect(stockDeducted.toString()).toBe('30.000');

    const cancelRes = await cancelTransfer.execute({
      tenantId: 'tenant-alpha',
      transferId: 'trf-2',
      reason: 'Damaged packaging during transit load',
    });

    expect(cancelRes.ok).toBe(true);
    if (!cancelRes.ok) return;

    expect(cancelRes.value.status).toBe('CANCELLED');

    const stockRestored = await getStock.execute({
      tenantId: 'tenant-alpha',
      warehouseId: 'wh-source',
      productId: 'prod-x',
    });
    expect(stockRestored.toString()).toBe('50.000');
  });

  it('rejects initiating transfer when source stock is insufficient', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);

    await createWh.execute({
      id: 'wh-source',
      tenantId: 'tenant-alpha',
      code: 'SRC',
      name: 'Source Warehouse',
    });
    await createWh.execute({
      id: 'wh-dest',
      tenantId: 'tenant-alpha',
      code: 'DST',
      name: 'Destination Warehouse',
    });

    const qtyInitRes = Quantity.of(10);
    expect(qtyInitRes.ok).toBe(true);
    if (!qtyInitRes.ok) return;

    warehouseRepo.setStock('tenant-alpha', 'wh-source', 'prod-scarce', qtyInitRes.value);

    const result = await initiateTransfer.execute({
      id: 'trf-3',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-source',
      destinationWarehouseId: 'wh-dest',
      lines: [{ productId: 'prod-scarce', quantity: 25 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('InsufficientWarehouseStock');
  });

  it('rejects initiating transfer between the same source and destination warehouse', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);

    await createWh.execute({
      id: 'wh-same',
      tenantId: 'tenant-alpha',
      code: 'SAME',
      name: 'Same Warehouse',
    });

    const result = await initiateTransfer.execute({
      id: 'trf-4',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-same',
      destinationWarehouseId: 'wh-same',
      lines: [{ productId: 'prod-1', quantity: 5 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('SameSourceAndDestination');
  });

  it('rejects transfer initiation when source or destination warehouse is inactive', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);

    await createWh.execute({
      id: 'wh-active',
      tenantId: 'tenant-alpha',
      code: 'ACT',
      name: 'Active Warehouse',
    });
    await createWh.execute({
      id: 'wh-inactive',
      tenantId: 'tenant-alpha',
      code: 'INACT',
      name: 'Inactive Warehouse',
    });

    const inactiveWh = await warehouseRepo.findById('tenant-alpha', 'wh-inactive');
    expect(inactiveWh).not.toBeNull();
    if (!inactiveWh) return;

    await warehouseRepo.save(inactiveWh.deactivate());

    const result = await initiateTransfer.execute({
      id: 'trf-5',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-active',
      destinationWarehouseId: 'wh-inactive',
      lines: [{ productId: 'prod-1', quantity: 5 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('DestinationWarehouseInactive');
  });

  it('rejects operations on already finalized transfers', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);
    const receiveTransfer = new ReceiveTransferCommandHandler(transferRepo, warehouseRepo);
    const cancelTransfer = new CancelTransferCommandHandler(transferRepo, warehouseRepo);

    await createWh.execute({
      id: 'wh-source',
      tenantId: 'tenant-alpha',
      code: 'SRC',
      name: 'Source Warehouse',
    });
    await createWh.execute({
      id: 'wh-dest',
      tenantId: 'tenant-alpha',
      code: 'DST',
      name: 'Destination Warehouse',
    });

    const qtyInitRes = Quantity.of(100);
    expect(qtyInitRes.ok).toBe(true);
    if (!qtyInitRes.ok) return;

    warehouseRepo.setStock('tenant-alpha', 'wh-source', 'prod-1', qtyInitRes.value);

    await initiateTransfer.execute({
      id: 'trf-6',
      tenantId: 'tenant-alpha',
      sourceWarehouseId: 'wh-source',
      destinationWarehouseId: 'wh-dest',
      lines: [{ productId: 'prod-1', quantity: 10 }],
    });

    await receiveTransfer.execute({
      tenantId: 'tenant-alpha',
      transferId: 'trf-6',
    });

    const secondReceive = await receiveTransfer.execute({
      tenantId: 'tenant-alpha',
      transferId: 'trf-6',
    });

    expect(secondReceive.ok).toBe(false);
    if (secondReceive.ok) return;
    expect(secondReceive.error.kind).toBe('InvalidTransferStatusTransition');

    const cancelAfterReceive = await cancelTransfer.execute({
      tenantId: 'tenant-alpha',
      transferId: 'trf-6',
      reason: 'Should fail',
    });

    expect(cancelAfterReceive.ok).toBe(false);
    if (cancelAfterReceive.ok) return;
    expect(cancelAfterReceive.error.kind).toBe('TransferAlreadyFinalized');
  });

  it('lists transfers scoped strictly by tenant', async () => {
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryTransferRepository();

    const createWh = new CreateWarehouseCommandHandler(warehouseRepo);
    const initiateTransfer = new InitiateTransferCommandHandler(transferRepo, warehouseRepo);
    const listTransfers = new ListTransfersQueryHandler(transferRepo);

    await createWh.execute({ id: 'wh-a1', tenantId: 'tenant-a', code: 'A1', name: 'A1' });
    await createWh.execute({ id: 'wh-a2', tenantId: 'tenant-a', code: 'A2', name: 'A2' });
    await createWh.execute({ id: 'wh-b1', tenantId: 'tenant-b', code: 'B1', name: 'B1' });
    await createWh.execute({ id: 'wh-b2', tenantId: 'tenant-b', code: 'B2', name: 'B2' });

    const qty = Quantity.of(50);
    if (!qty.ok) return;

    warehouseRepo.setStock('tenant-a', 'wh-a1', 'prod-1', qty.value);
    warehouseRepo.setStock('tenant-b', 'wh-b1', 'prod-1', qty.value);

    await initiateTransfer.execute({
      id: 'trf-a',
      tenantId: 'tenant-a',
      sourceWarehouseId: 'wh-a1',
      destinationWarehouseId: 'wh-a2',
      lines: [{ productId: 'prod-1', quantity: 5 }],
    });

    await initiateTransfer.execute({
      id: 'trf-b',
      tenantId: 'tenant-b',
      sourceWarehouseId: 'wh-b1',
      destinationWarehouseId: 'wh-b2',
      lines: [{ productId: 'prod-1', quantity: 5 }],
    });

    const listA = await listTransfers.execute({ tenantId: 'tenant-a' });
    const listB = await listTransfers.execute({ tenantId: 'tenant-b' });

    expect(listA.length).toBe(1);
    expect(listA[0]?.id).toBe('trf-a');

    expect(listB.length).toBe(1);
    expect(listB[0]?.id).toBe('trf-b');
  });
});
