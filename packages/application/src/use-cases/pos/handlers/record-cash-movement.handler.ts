import type { Result } from '@corebiz/domain';
import type { Command, CommandHandler } from '../command-bus';
import {
  makeRecordCashMovement,
  type RecordCashMovementDeps,
  type RecordCashMovementInput,
  type RecordCashMovementOutput,
  type RecordCashMovementError,
} from '../record-cash-movement';

export interface RecordCashMovementCommand extends Command, RecordCashMovementInput {
  readonly type: 'cash.movement';
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
    return this.useCase(command);
  }
}
