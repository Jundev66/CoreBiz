import {
  BankStatement,
  BankStatementLine,
  type BankStatementLineType,
  type BankStatementRepository,
  type AccountRepository,
  Money,
  type Currency,
  ok,
  err,
  type Result,
} from '../../domain/index';

export interface BankStatementLineInput {
  readonly id: string;
  readonly lineType: BankStatementLineType;
  readonly amountMinor: bigint;
  readonly transactionDate: Date;
  readonly reference: string;
  readonly description: string;
}

export interface ImportBankStatementCommand {
  readonly id: string;
  readonly tenantId: string;
  readonly bankAccountId: string;
  readonly currency: Currency;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly startingBalanceMinor: bigint;
  readonly endingBalanceMinor: bigint;
  readonly lines: readonly BankStatementLineInput[];
}

export interface ImportBankStatementError {
  readonly kind:
    | 'AccountNotFound'
    | 'AccountNotAsset'
    | 'InvalidDateRange'
    | 'CurrencyMismatch'
    | 'InvalidLineAmount'
    | 'StatementAlreadyExists';
  readonly details?: string | undefined;
}

export class ImportBankStatementCommandHandler {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly statementRepository: BankStatementRepository,
  ) {}

  async execute(
    command: ImportBankStatementCommand,
  ): Promise<Result<{ statementId: string; lineCount: number }, ImportBankStatementError>> {
    const account = await this.accountRepository.findById(command.tenantId, command.bankAccountId);
    if (!account) {
      return err({ kind: 'AccountNotFound', details: command.bankAccountId });
    }
    if (account.category !== 'ASSET') {
      return err({ kind: 'AccountNotAsset', details: command.bankAccountId });
    }

    const existing = await this.statementRepository.findById(command.tenantId, command.id);
    if (existing) {
      return err({ kind: 'StatementAlreadyExists', details: command.id });
    }

    const startingBalance = Money.fromMinor(command.startingBalanceMinor, command.currency);
    const endingBalance = Money.fromMinor(command.endingBalanceMinor, command.currency);

    const domainLines: BankStatementLine[] = [];
    for (const input of command.lines) {
      const lineAmount = Money.fromMinor(input.amountMinor, command.currency);
      const lineResult = BankStatementLine.create({
        id: input.id,
        statementId: command.id,
        lineType: input.lineType,
        amount: lineAmount,
        transactionDate: input.transactionDate,
        reference: input.reference,
        description: input.description,
      });

      if (!lineResult.ok) {
        return err({ kind: 'InvalidLineAmount', details: input.id });
      }

      domainLines.push(lineResult.value);
    }

    const statementResult = BankStatement.create({
      id: command.id,
      tenantId: command.tenantId,
      bankAccountId: command.bankAccountId,
      currency: command.currency,
      startDate: command.startDate,
      endDate: command.endDate,
      startingBalance,
      endingBalance,
      lines: domainLines,
    });

    if (!statementResult.ok) {
      if (statementResult.error.kind === 'InvalidDateRange') {
        return err({ kind: 'InvalidDateRange' });
      }
      return err({ kind: 'CurrencyMismatch' });
    }

    await this.statementRepository.save(statementResult.value);

    return ok({
      statementId: command.id,
      lineCount: domainLines.length,
    });
  }
}
