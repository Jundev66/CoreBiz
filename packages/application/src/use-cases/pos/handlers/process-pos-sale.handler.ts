import type { Result } from '@corebiz/domain';
import type { Command, CommandHandler } from '../command-bus';
import {
  makeProcessPosSale,
  type ProcessPosSaleDeps,
  type ProcessPosSaleInput,
  type ProcessPosSaleOutput,
  type ProcessPosSaleError,
} from '../process-pos-sale';

export interface ProcessPosSaleCommand extends Command, ProcessPosSaleInput {
  readonly type: 'sale.issue';
}

export class ProcessPosSaleCommandHandler implements CommandHandler<
  ProcessPosSaleCommand,
  ProcessPosSaleOutput
> {
  private readonly useCase: ReturnType<typeof makeProcessPosSale>;

  constructor(deps: ProcessPosSaleDeps) {
    this.useCase = makeProcessPosSale(deps);
  }

  subscribedTo(): string {
    return 'sale.issue';
  }

  async handle(
    command: ProcessPosSaleCommand,
  ): Promise<Result<ProcessPosSaleOutput, ProcessPosSaleError>> {
    return this.useCase(command);
  }
}
