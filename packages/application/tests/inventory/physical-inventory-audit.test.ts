import { describe, expect, it } from 'vitest';
import { Quantity } from '@corebiz/shared-kernel';
import { InMemoryJournalEntryRepository } from '@corebiz/accounting';
import { Warehouse } from '@corebiz/domain';
import {
  InMemoryWarehouseRepository,
  InMemoryPhysicalInventoryAuditRepository,
} from '../../src/adapters/memory/inventory';
import { CreateInventoryAuditCommandHandler } from '../../src/inventory/commands/create-inventory-audit.command';
import { RecordAuditCountsCommandHandler } from '../../src/inventory/commands/record-audit-counts.command';
import { ApproveInventoryAuditCommandHandler } from '../../src/inventory/commands/approve-inventory-audit.command';
import { CancelInventoryAuditCommandHandler } from '../../src/inventory/commands/cancel-inventory-audit.command';
import { ListInventoryAuditsQueryHandler } from '../../src/inventory/queries/list-inventory-audits.query';
import { GetInventoryAuditDetailsQueryHandler } from '../../src/inventory/queries/get-inventory-audit-details.query';

describe('Physical Inventory Audit & Shrinkage Postings', () => {
  const tenantId = 'tenant-alpha';
  const warehouseId = 'wh-main';

  async function setupWarehouse(whRepo: InMemoryWarehouseRepository) {
    const whRes = Warehouse.create({
      id: warehouseId,
      tenantId,
      code: 'WH-MAIN',
      name: 'Main Distribution Hub',
      isDefault: true,
    });
    if (!whRes.ok) throw new Error('Warehouse creation failed');
    await whRepo.save(whRes.value);

    whRepo.setStock(tenantId, warehouseId, 'prod-oil', Quantity.fromScaled(100000n));
    whRepo.setStock(tenantId, warehouseId, 'prod-flour', Quantity.fromScaled(50000n));
  }

  it('creates an inventory audit and captures theoretical stock from warehouse', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const handler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    const result = await handler.execute({
      id: 'audit-001',
      tenantId,
      warehouseId,
      blindCount: false,
      notes: 'End of month cycle count',
      lines: [
        {
          productId: 'prod-oil',
          unitCostMinor: '200',
        },
        {
          productId: 'prod-flour',
          unitCostMinor: '150',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.auditNumber).toBe('INV-AUD-000001');
    expect(result.value.status).toBe('OPEN');

    const saved = await auditRepo.findById(tenantId, 'audit-001');
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe('OPEN');
    expect(saved?.lines.length).toBe(2);
    expect(saved?.lines[0]?.theoreticalQuantity.toString()).toBe('100.000');
    expect(saved?.lines[1]?.theoreticalQuantity.toString()).toBe('50.000');
    expect(saved?.lines[0]?.countedQuantity).toBeNull();
  });

  it('masks theoretical stock in query details when blindCount is active and audit is OPEN', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-blind',
      tenantId,
      warehouseId,
      blindCount: true,
      lines: [
        {
          productId: 'prod-oil',
          unitCostMinor: '200',
        },
      ],
    });

    const queryHandler = new GetInventoryAuditDetailsQueryHandler(auditRepo);
    const detailsRes = await queryHandler.execute({
      tenantId,
      auditId: 'audit-blind',
    });

    expect(detailsRes.ok).toBe(true);
    if (!detailsRes.ok) return;

    expect(detailsRes.value.blindCount).toBe(true);
    expect(detailsRes.value.lines[0]?.theoreticalQuantity).toBeNull();
    expect(detailsRes.value.lines[0]?.discrepancyQuantity).toBeNull();
  });

  it('records physical counts and computes shortages and surpluses', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-002',
      tenantId,
      warehouseId,
      lines: [
        {
          productId: 'prod-oil',
          unitCostMinor: '200',
        },
        {
          productId: 'prod-flour',
          unitCostMinor: '150',
        },
      ],
    });

    const recordHandler = new RecordAuditCountsCommandHandler(auditRepo);
    const recordResult = await recordHandler.execute({
      tenantId,
      auditId: 'audit-002',
      counts: [
        { productId: 'prod-oil', countedQuantity: '95.000' },
        { productId: 'prod-flour', countedQuantity: '55.000' },
      ],
    });

    expect(recordResult.ok).toBe(true);
    if (!recordResult.ok) return;

    expect(recordResult.value.status).toBe('IN_REVIEW');
    expect(recordResult.value.hasDiscrepancies).toBe(true);

    const updated = await auditRepo.findById(tenantId, 'audit-002');
    expect(updated?.status).toBe('IN_REVIEW');
    expect(updated?.lines[0]?.countedQuantity?.toString()).toBe('95.000');
    expect(updated?.lines[0]?.discrepancyQuantity.toString()).toBe('-5.000');
    expect(updated?.lines[0]?.discrepancyMonetaryValue.minorUnits).toBe(-1000n);

    expect(updated?.lines[1]?.countedQuantity?.toString()).toBe('55.000');
    expect(updated?.lines[1]?.discrepancyQuantity.toString()).toBe('5.000');
    expect(updated?.lines[1]?.discrepancyMonetaryValue.minorUnits).toBe(750n);

    expect(updated?.totalShortageValue.minorUnits).toBe(1000n);
    expect(updated?.totalSurplusValue.minorUnits).toBe(750n);
  });

  it('approves audit with discrepancies, updating warehouse stock and posting balanced double-entry journal entry', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-003',
      tenantId,
      warehouseId,
      lines: [
        {
          productId: 'prod-oil',
          unitCostMinor: '200',
        },
        {
          productId: 'prod-flour',
          unitCostMinor: '150',
        },
      ],
    });

    const recordHandler = new RecordAuditCountsCommandHandler(auditRepo);
    await recordHandler.execute({
      tenantId,
      auditId: 'audit-003',
      counts: [
        { productId: 'prod-oil', countedQuantity: '95.000' },
        { productId: 'prod-flour', countedQuantity: '55.000' },
      ],
    });

    const approveHandler = new ApproveInventoryAuditCommandHandler(auditRepo, whRepo, journalRepo);

    const approveResult = await approveHandler.execute({
      tenantId,
      auditId: 'audit-003',
      shrinkageExpenseAccountId: '6.1.05',
      inventoryAssetAccountId: '1.1.03',
      surplusIncomeAccountId: '4.1.03',
    });

    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;

    expect(approveResult.value.status).toBe('APPROVED');
    expect(approveResult.value.journalEntryId).toBeDefined();

    const stockOil = await whRepo.getStock(tenantId, warehouseId, 'prod-oil');
    expect(stockOil.toString()).toBe('95.000');

    const stockFlour = await whRepo.getStock(tenantId, warehouseId, 'prod-flour');
    expect(stockFlour.toString()).toBe('55.000');

    const journalEntries = await journalRepo.listByDateRange(
      tenantId,
      new Date('2020-01-01'),
      new Date('2030-01-01'),
    );
    expect(journalEntries.length).toBe(1);

    const entry = journalEntries[0]!;
    expect(entry.lines.length).toBe(4);
    expect(entry.totalDebit).toBe(1750n);
    expect(entry.totalCredit).toBe(1750n);
    expect(entry.totalDebit === entry.totalCredit).toBe(true);

    const shrinkageLine = entry.lines.find((l) => l.accountId === '6.1.05');
    expect(shrinkageLine).toBeDefined();
    expect(shrinkageLine?.debit.minorUnits).toBe(1000n);

    const surplusLine = entry.lines.find((l) => l.accountId === '4.1.03');
    expect(surplusLine).toBeDefined();
    expect(surplusLine?.credit.minorUnits).toBe(750n);
  });

  it('approves audit with zero discrepancies without posting empty journal entry', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    const journalRepo = new InMemoryJournalEntryRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-perfect',
      tenantId,
      warehouseId,
      lines: [
        {
          productId: 'prod-oil',
          unitCostMinor: '200',
        },
      ],
    });

    const recordHandler = new RecordAuditCountsCommandHandler(auditRepo);
    await recordHandler.execute({
      tenantId,
      auditId: 'audit-perfect',
      counts: [{ productId: 'prod-oil', countedQuantity: '100.000' }],
    });

    const approveHandler = new ApproveInventoryAuditCommandHandler(auditRepo, whRepo, journalRepo);
    const approveResult = await approveHandler.execute({
      tenantId,
      auditId: 'audit-perfect',
    });

    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;

    expect(approveResult.value.status).toBe('APPROVED');
    expect(approveResult.value.journalEntryId).toBeUndefined();

    const journalEntries = await journalRepo.listByDateRange(
      tenantId,
      new Date('2020-01-01'),
      new Date('2030-01-01'),
    );
    expect(journalEntries.length).toBe(0);
  });

  it('rejects approval when audit is not in IN_REVIEW state', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-open',
      tenantId,
      warehouseId,
      lines: [{ productId: 'prod-oil', unitCostMinor: '200' }],
    });

    const approveHandler = new ApproveInventoryAuditCommandHandler(auditRepo, whRepo);
    const result = await approveHandler.execute({
      tenantId,
      auditId: 'audit-open',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('AuditNotReadyForApproval');
  });

  it('cancels an audit with reason and prevents further modifications', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    await createHandler.execute({
      id: 'audit-cancel',
      tenantId,
      warehouseId,
      lines: [{ productId: 'prod-oil', unitCostMinor: '200' }],
    });

    const cancelHandler = new CancelInventoryAuditCommandHandler(auditRepo);
    const cancelResult = await cancelHandler.execute({
      tenantId,
      auditId: 'audit-cancel',
      reason: 'Unscheduled maintenance required in warehouse aisle 3',
    });

    expect(cancelResult.ok).toBe(true);

    const recordHandler = new RecordAuditCountsCommandHandler(auditRepo);
    const recordResult = await recordHandler.execute({
      tenantId,
      auditId: 'audit-cancel',
      counts: [{ productId: 'prod-oil', countedQuantity: '90.000' }],
    });

    expect(recordResult.ok).toBe(false);
    if (recordResult.ok) return;
    expect(recordResult.error.kind).toBe('InvalidStatusTransition');
  });

  it('lists audits filtered by warehouse', async () => {
    const whRepo = new InMemoryWarehouseRepository();
    const auditRepo = new InMemoryPhysicalInventoryAuditRepository();
    await setupWarehouse(whRepo);

    const whOtherRes = Warehouse.create({
      id: 'wh-other',
      tenantId,
      code: 'WH-OTHER',
      name: 'Secondary Warehouse',
    });
    if (!whOtherRes.ok) throw new Error('Warehouse creation failed');
    await whRepo.save(whOtherRes.value);
    whRepo.setStock(tenantId, 'wh-other', 'prod-oil', Quantity.fromScaled(10000n));

    const createHandler = new CreateInventoryAuditCommandHandler(auditRepo, whRepo);
    const resA1 = await createHandler.execute({
      id: 'audit-a1',
      tenantId,
      warehouseId: 'wh-main',
      lines: [{ productId: 'prod-oil', unitCostMinor: '200' }],
    });
    expect(resA1.ok).toBe(true);

    const resA2 = await createHandler.execute({
      id: 'audit-a2',
      tenantId,
      warehouseId: 'wh-other',
      lines: [{ productId: 'prod-oil', unitCostMinor: '200' }],
    });
    expect(resA2.ok).toBe(true);

    const listHandler = new ListInventoryAuditsQueryHandler(auditRepo);
    const listWhMain = await listHandler.execute({
      tenantId,
      warehouseId: 'wh-main',
    });

    expect(listWhMain.length).toBe(1);
    expect(listWhMain[0]?.id).toBe('audit-a1');

    const listAll = await listHandler.execute({ tenantId });
    expect(listAll.length).toBe(2);
  });
});
