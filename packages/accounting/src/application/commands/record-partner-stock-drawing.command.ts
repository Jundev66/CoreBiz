import { type Currency, type Result, ok, err, Money } from '@corebiz/shared-kernel';
import {
  type AccountRepository,
  type JournalEntryRepository,
  type PartnerDrawingRepository,
  JournalEntry,
  JournalEntryLine,
  PartnerDrawing,
} from '../../domain/index';

export interface RecordPartnerStockDrawingCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly drawingAccountId: string;
  readonly inventoryAccountId: string;
  readonly currency: Currency;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostMinor: bigint;
  readonly operatorUserId: string;
  readonly notes: string;
}

export interface RecordPartnerStockDrawingResult {
  readonly drawing: PartnerDrawing;
  readonly journalEntry: JournalEntry;
}

export interface RecordPartnerStockDrawingError {
  readonly kind:
    | 'DrawingAccountNotFound'
    | 'InventoryAccountNotFound'
    | 'DrawingAccountInvalidCategory'
    | 'InventoryAccountNotAsset'
    | 'IdenticalAccounts'
    | 'InvalidQuantity'
    | 'InvalidUnitCost'
    | 'JournalEntryError'
    | 'DrawingValidationError';
  readonly details?: string | undefined;
}

export class RecordPartnerStockDrawingCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly partnerDrawingRepository: PartnerDrawingRepository,
  ) {}

  async execute(
    command: RecordPartnerStockDrawingCommand,
  ): Promise<Result<RecordPartnerStockDrawingResult, RecordPartnerStockDrawingError>> {
    if (command.drawingAccountId === command.inventoryAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (command.quantity <= 0) {
      return err({ kind: 'InvalidQuantity' });
    }

    if (command.unitCostMinor <= 0n) {
      return err({ kind: 'InvalidUnitCost' });
    }

    const drawingAccount = await this.accountRepository.findById(
      command.tenantId,
      command.drawingAccountId,
    );
    if (!drawingAccount) {
      return err({ kind: 'DrawingAccountNotFound' });
    }
    if (drawingAccount.category !== 'EQUITY' && drawingAccount.category !== 'ASSET') {
      return err({ kind: 'DrawingAccountInvalidCategory' });
    }

    const inventoryAccount = await this.accountRepository.findById(
      command.tenantId,
      command.inventoryAccountId,
    );
    if (!inventoryAccount) {
      return err({ kind: 'InventoryAccountNotFound' });
    }
    if (inventoryAccount.category !== 'ASSET') {
      return err({ kind: 'InventoryAccountNotAsset' });
    }

    const totalCostMinor = BigInt(Math.floor(command.quantity)) * command.unitCostMinor;
    const nextEntryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const nextDrawingNumber = await this.partnerDrawingRepository.nextDrawingNumber(
      command.tenantId,
    );

    const zero = Money.zero(command.currency);
    const totalCostAmount = Money.fromMinor(totalCostMinor, command.currency);
    const unitCostAmount = Money.fromMinor(command.unitCostMinor, command.currency);

    const drawingLineResult = JournalEntryLine.create(
      command.drawingAccountId,
      totalCostAmount,
      zero,
      `Autoconsumo de Socio: ${command.partnerName} (${command.quantity} uds)`,
    );
    if (!drawingLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: drawingLineResult.error.kind });
    }

    const inventoryLineResult = JournalEntryLine.create(
      command.inventoryAccountId,
      zero,
      totalCostAmount,
      `Baja de Inventario a Costo: ${command.productId}`,
    );
    if (!inventoryLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: inventoryLineResult.error.kind });
    }

    const journalResult = JournalEntry.create({
      id: `${command.id}-journal`,
      tenantId: command.tenantId,
      entryNumber: nextEntryNumber,
      date: command.date,
      description: `Autoconsumo de mercancía #${nextDrawingNumber}: ${command.partnerName} (${command.notes})`,
      sourceType: 'PARTNER_DRAWING',
      sourceId: command.id,
      lines: [drawingLineResult.value, inventoryLineResult.value],
    });

    if (!journalResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalResult.error.kind });
    }

    const drawingResult = PartnerDrawing.create({
      id: command.id,
      tenantId: command.tenantId,
      drawingNumber: nextDrawingNumber,
      drawingType: 'STOCK',
      date: command.date,
      partnerId: command.partnerId,
      partnerName: command.partnerName,
      drawingAccountId: command.drawingAccountId,
      creditAccountId: command.inventoryAccountId,
      currency: command.currency,
      amount: totalCostAmount,
      productId: command.productId,
      quantity: command.quantity,
      unitCost: unitCostAmount,
      operatorUserId: command.operatorUserId,
      notes: command.notes,
      journalEntryId: journalResult.value.id,
      status: 'COMPLETED',
      createdAt: new Date(),
    });

    if (!drawingResult.ok) {
      return err({ kind: 'DrawingValidationError', details: drawingResult.error.kind });
    }

    await this.journalEntryRepository.save(journalResult.value);
    await this.partnerDrawingRepository.save(drawingResult.value);

    return ok({
      drawing: drawingResult.value,
      journalEntry: journalResult.value,
    });
  }
}
