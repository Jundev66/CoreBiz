import type { Result } from '@corebiz/domain';
import type { Command, CommandHandler } from '../command-bus';
import {
  makeCloseCashShift,
  type CloseCashShiftDeps,
  type CloseCashShiftInput,
  type CloseCashShiftOutput,
  type CloseCashShiftError,
} from '../close-cash-shift';

export interface CloseCashShiftCommand extends Command, CloseCashShiftInput {
  readonly type: 'shift.close';
}

export class CloseCashShiftCommandHandler implements CommandHandler<
  CloseCashShiftCommand,
  CloseCashShiftOutput
> {
  private readonly useCase: ReturnType<typeof makeCloseCashShift>;

  constructor(deps: CloseCashShiftDeps) {
    this.useCase = makeCloseCashShift(deps);
  }

  subscribedTo(): string {
    return 'shift.close';
  }

  async handle(
    command: CloseCashShiftCommand,
  ): Promise<Result<CloseCashShiftOutput, CloseCashShiftError>> {
    return this.useCase(command);
  }
}
