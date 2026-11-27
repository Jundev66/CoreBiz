import { type Currency, type Result, ok, err, Money } from '@corebiz/shared-kernel';
import {
  type AccountRepository,
  type JournalEntryRepository,
  type PartnerDrawingRepository,
  JournalEntry,
  JournalEntryLine,
  PartnerDrawing,
} from '../../domain/index';

export interface RecordPartnerCashDrawingCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly partnerId: string;
  readonly partnerName: string;
  readonly drawingAccountId: string;
  readonly cashAccountId: string;
  readonly currency: Currency;
  readonly amountMinor: bigint;
  readonly operatorUserId: string;
  readonly notes: string;
}

export interface RecordPartnerCashDrawingResult {
  readonly drawing: PartnerDrawing;
  readonly journalEntry: JournalEntry;
}

export interface RecordPartnerCashDrawingError {
  readonly kind:
    | 'DrawingAccountNotFound'
    | 'CashAccountNotFound'
    | 'DrawingAccountInvalidCategory'
    | 'CashAccountNotAsset'
    | 'IdenticalAccounts'
    | 'InvalidAmount'
    | 'JournalEntryError'
    | 'DrawingValidationError';
  readonly details?: string | undefined;
}

export class RecordPartnerCashDrawingCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly partnerDrawingRepository: PartnerDrawingRepository,
  ) {}

  async execute(
    command: RecordPartnerCashDrawingCommand,
  ): Promise<Result<RecordPartnerCashDrawingResult, RecordPartnerCashDrawingError>> {
    if (command.drawingAccountId === command.cashAccountId) {
      return err({ kind: 'IdenticalAccounts' });
    }

    if (command.amountMinor <= 0n) {
      return err({ kind: 'InvalidAmount', details: 'Drawing amount must be positive' });
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

    const cashAccount = await this.accountRepository.findById(
      command.tenantId,
      command.cashAccountId,
    );
    if (!cashAccount) {
      return err({ kind: 'CashAccountNotFound' });
    }
    if (cashAccount.category !== 'ASSET') {
      return err({ kind: 'CashAccountNotAsset' });
    }

    const nextEntryNumber = await this.journalEntryRepository.nextEntryNumber(command.tenantId);
    const nextDrawingNumber = await this.partnerDrawingRepository.nextDrawingNumber(
      command.tenantId,
    );

    const zero = Money.zero(command.currency);
    const drawingAmount = Money.fromMinor(command.amountMinor, command.currency);

    const drawingLineResult = JournalEntryLine.create(
      command.drawingAccountId,
      drawingAmount,
      zero,
      `Retiro de Socio: ${command.partnerName}`,
    );
    if (!drawingLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: drawingLineResult.error.kind });
    }

    const cashLineResult = JournalEntryLine.create(
      command.cashAccountId,
      zero,
      drawingAmount,
      `Salida de Efectivo/Banco: ${command.partnerName}`,
    );
    if (!cashLineResult.ok) {
      return err({ kind: 'JournalEntryError', details: cashLineResult.error.kind });
    }

    const journalResult = JournalEntry.create({
      id: crypto.randomUUID(),
      tenantId: command.tenantId,
      entryNumber: nextEntryNumber,
      date: command.date,
      description: `Retiro de fondos #${nextDrawingNumber}: ${command.partnerName} (${command.notes})`,
      sourceType: 'PARTNER_DRAWING',
      sourceId: command.id,
      lines: [drawingLineResult.value, cashLineResult.value],
    });

    if (!journalResult.ok) {
      return err({ kind: 'JournalEntryError', details: journalResult.error.kind });
    }

    const drawingResult = PartnerDrawing.create({
      id: command.id,
      tenantId: command.tenantId,
      drawingNumber: nextDrawingNumber,
      drawingType: 'CASH',
      date: command.date,
      partnerId: command.partnerId,
      partnerName: command.partnerName,
      drawingAccountId: command.drawingAccountId,
      creditAccountId: command.cashAccountId,
      currency: command.currency,
      amount: drawingAmount,
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
