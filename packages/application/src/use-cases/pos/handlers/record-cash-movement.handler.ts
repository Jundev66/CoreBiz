import type { CashMovementType, Result } from '@corebiz/domain';
import type { Command, CommandHandler } from '../command-bus';
import {
  makeRecordCashMovement,
  type RecordCashMovementDeps,
  type RecordCashMovementInput,
  type RecordCashMovementOutput,
  type RecordCashMovementError,
} from '../record-cash-movement';

export interface RecordCashMovementCommand extends Command, Omit<RecordCashMovementInput, 'type'> {
  readonly type: 'cash.movement';
  readonly movementType: CashMovementType;
}

export class RecordCashMovementCommandHandler implements CommandHandler<
  RecordCashMovementCommand,
  RecordCashMovementOutput
> {
  private readonly useCase: ReturnType<typeof makeRecordCashMovement>;

  constructor(deps: RecordCashMovementDeps) {
    this.useCase = makeRecordCashMovement(deps);
  }

  subscribedTo(): string {
    return 'cash.movement';
  }

  async handle(
    command: RecordCashMovementCommand,
  ): Promise<Result<RecordCashMovementOutput, RecordCashMovementError>> {
    const { type: _cmdType, movementType, ...rest } = command;
    return this.useCase({
      ...rest,
      type: movementType,
    });
  }
}
