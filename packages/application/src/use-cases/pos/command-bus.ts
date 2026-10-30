import type { Result } from '@corebiz/domain';

export interface Command {
  readonly type: string;
}

export interface CommandHandler<TCommand extends Command, TResult> {
  subscribedTo(): string;
  handle(command: TCommand): Promise<Result<TResult, unknown>>;
}

export class PosCommandBus {
  private readonly handlers = new Map<string, CommandHandler<Command, unknown>>();

  register<TCommand extends Command, TResult>(handler: CommandHandler<TCommand, TResult>): void {
    this.handlers.set(handler.subscribedTo(), handler);
  }

  async dispatch<TResult = unknown>(command: Command): Promise<Result<TResult, unknown>> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      return {
        ok: false,
        error: { kind: 'NoHandlerForCommand', type: command.type },
      };
    }
    return handler.handle(command) as Promise<Result<TResult, unknown>>;
  }
}
