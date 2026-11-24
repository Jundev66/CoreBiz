import { describe, it, expect, beforeEach } from 'vitest';
import { RecordPartnerCashDrawingCommandHandler } from '../src/application/commands/record-partner-cash-drawing.command';
import { RecordPartnerStockDrawingCommandHandler } from '../src/application/commands/record-partner-stock-drawing.command';
import { ListPartnerDrawingsQueryHandler } from '../src/application/queries/list-partner-drawings.query';
import { InMemoryAccountRepository } from '../src/infrastructure/memory/in-memory-account-repository';
import { InMemoryJournalEntryRepository } from '../src/infrastructure/memory/in-memory-journal-entry-repository';
import { InMemoryPartnerDrawingRepository } from '../src/infrastructure/memory/in-memory-partner-drawing-repository';
import { AccountMother } from './mothers/AccountMother';

describe('Partner Drawings Command & Query Handlers', () => {
  let accountRepo: InMemoryAccountRepository;
  let journalRepo: InMemoryJournalEntryRepository;
  let drawingRepo: InMemoryPartnerDrawingRepository;
  let cashHandler: RecordPartnerCashDrawingCommandHandler;
  let stockHandler: RecordPartnerStockDrawingCommandHandler;
  let listHandler: ListPartnerDrawingsQueryHandler;

  const tenantId = 'tenant-drawings-01';
  const cashAccountId = 'acc-cash-drawer';
  const inventoryAccountId = 'acc-inventory';
  const equityDrawingAccountId = 'acc-partner-equity';
  const receivableDrawingAccountId = 'acc-partner-receivable';

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    journalRepo = new InMemoryJournalEntryRepository();
    drawingRepo = new InMemoryPartnerDrawingRepository();

    cashHandler = new RecordPartnerCashDrawingCommandHandler(accountRepo, journalRepo, drawingRepo);
    stockHandler = new RecordPartnerStockDrawingCommandHandler(
      accountRepo,
      journalRepo,
      drawingRepo,
    );
    listHandler = new ListPartnerDrawingsQueryHandler(drawingRepo);

    const cashDrawer = AccountMother.asset('1.1.01.01', 'Caja Mostrador', tenantId, cashAccountId);
    const inventory = AccountMother.asset(
      '1.1.03.01',
      'Inventario Mercancía',
      tenantId,
      inventoryAccountId,
    );
    const partnerEquity = AccountMother.create(
      '3.1.02.01',
      'Retiros de Capital Socios',
      'EQUITY',
      tenantId,
      equityDrawingAccountId,
    );
    const partnerReceivable = AccountMother.asset(
      '1.2.01.01',
      'Cuentas por Cobrar Socios',
      tenantId,
      receivableDrawingAccountId,
    );

    await accountRepo.save(cashDrawer);
    await accountRepo.save(inventory);
    await accountRepo.save(partnerEquity);
    await accountRepo.save(partnerReceivable);
  });

  it('Scenario 1: records partner cash withdrawal and generates balanced journal entry', async () => {
    const result = await cashHandler.execute({
      id: 'drawing-cash-01',
      tenantId,
      date: new Date('2026-11-24T14:00:00Z'),
      partnerId: 'partner-founder-01',
      partnerName: 'Socio Principal 01',
      drawingAccountId: equityDrawingAccountId,
      cashAccountId,
      currency: 'USD',
      amountMinor: 200_00n,
      operatorUserId: 'cashier-user-01',
      notes: 'Retiro en efectivo para gastos personales del socio',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { drawing, journalEntry } = result.value;

    expect(drawing.id).toBe('drawing-cash-01');
    expect(drawing.drawingNumber).toBe(1n);
    expect(drawing.drawingType).toBe('CASH');
    expect(drawing.partnerName).toBe('Socio Principal 01');
    expect(drawing.amount.minorUnits).toBe(200_00n);
    expect(drawing.status).toBe('COMPLETED');

    expect(journalEntry.sourceType).toBe('PARTNER_DRAWING');
    expect(journalEntry.sourceId).toBe('drawing-cash-01');
    expect(journalEntry.currency).toBe('USD');
    expect(journalEntry.totalDebit).toBe(200_00n);
    expect(journalEntry.totalCredit).toBe(200_00n);

    const savedDrawing = await drawingRepo.findById(tenantId, 'drawing-cash-01');
    expect(savedDrawing).toBeDefined();

    const savedJournal = await journalRepo.findById(tenantId, journalEntry.id);
    expect(savedJournal).toBeDefined();

    const list = await listHandler.execute(tenantId);
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe('drawing-cash-01');
  });

  it('Scenario 2: records partner merchandise consumption at cost and preserves debit-credit balance', async () => {
    const result = await stockHandler.execute({
      id: 'drawing-stock-01',
      tenantId,
      date: new Date('2026-11-24T15:00:00Z'),
      partnerId: 'partner-founder-01',
      partnerName: 'Socio Principal 01',
      drawingAccountId: equityDrawingAccountId,
      inventoryAccountId,
      currency: 'USD',
      productId: 'prod-item-55',
      quantity: 5,
      unitCostMinor: 20_00n,
      operatorUserId: 'warehouse-manager-01',
      notes: 'Autoconsumo de 5 cajas de producto para uso particular',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { drawing, journalEntry } = result.value;

    expect(drawing.id).toBe('drawing-stock-01');
    expect(drawing.drawingType).toBe('STOCK');
    expect(drawing.productId).toBe('prod-item-55');
    expect(drawing.quantity).toBe(5);
    expect(drawing.amount.minorUnits).toBe(100_00n);
    expect(drawing.status).toBe('COMPLETED');

    expect(journalEntry.sourceType).toBe('PARTNER_DRAWING');
    expect(journalEntry.currency).toBe('USD');
    expect(journalEntry.totalDebit).toBe(100_00n);
    expect(journalEntry.totalCredit).toBe(100_00n);
  });

  it('Scenario 3: rejects withdrawal when drawing and cash accounts are identical', async () => {
    const result = await cashHandler.execute({
      id: 'drawing-invalid-01',
      tenantId,
      date: new Date(),
      partnerId: 'partner-01',
      partnerName: 'Socio 01',
      drawingAccountId: cashAccountId,
      cashAccountId,
      currency: 'USD',
      amountMinor: 50_00n,
      operatorUserId: 'user-01',
      notes: 'Test invalid',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('IdenticalAccounts');
    }
  });
});
