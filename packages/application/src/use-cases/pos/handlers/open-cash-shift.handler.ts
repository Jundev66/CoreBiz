import type { Result } from '@corebiz/domain';
import type { Command, CommandHandler } from '../command-bus';
import {
  makeOpenCashShift,
  type OpenCashShiftDeps,
  type OpenCashShiftInput,
  type OpenCashShiftOutput,
  type OpenCashShiftError,
} from '../open-cash-shift';

export interface OpenCashShiftCommand extends Command, OpenCashShiftInput {
  readonly type: 'shift.open';
}

export class OpenCashShiftCommandHandler implements CommandHandler<
  OpenCashShiftCommand,
  OpenCashShiftOutput
> {
  private readonly useCase: ReturnType<typeof makeOpenCashShift>;

  constructor(deps: OpenCashShiftDeps) {
    this.useCase = makeOpenCashShift(deps);
  }

  subscribedTo(): string {
    return 'shift.open';
  }

  async handle(
    command: OpenCashShiftCommand,
  ): Promise<Result<OpenCashShiftOutput, OpenCashShiftError>> {
    return this.useCase(command);
  }
}
