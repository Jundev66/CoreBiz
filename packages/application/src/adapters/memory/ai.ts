import { err, ok, type Result, type TenantId } from '@corebiz/domain';
import type {
  AiConnection,
  AiGateway,
  AiGatewayError,
  AiModel,
  AiSettingsRecord,
  AiSettingsRepository,
  AssistantMessage,
  SecretBox,
} from '../../ports/ai';

export class InMemoryAiSettingsRepository implements AiSettingsRepository {
  constructor(
    private readonly store: Map<string, AiSettingsRecord>,
    private readonly tenantId: TenantId,
  ) {}

  find(): Promise<AiSettingsRecord | null> {
    return Promise.resolve(this.store.get(this.tenantId) ?? null);
  }

  save(record: AiSettingsRecord): Promise<void> {
    this.store.set(this.tenantId, record);
    return Promise.resolve();
  }

  remove(): Promise<void> {
    this.store.delete(this.tenantId);
    return Promise.resolve();
  }
}

/**
 * A reversible, NON-secret box for tests and the memory driver.
 *
 * It keeps the one property the use cases rely on — a value sealed for one context does not
 * open in another — and marks its output so a test can assert the stored value is not the
 * key in clear.
 */
export function testSecretBox(available = true): SecretBox {
  return {
    available,
    seal: (plaintext, context) => `sealed:${context}:${[...plaintext].reverse().join('')}`,
    open: (sealed, context) => {
      const prefix = `sealed:${context}:`;
      if (!sealed.startsWith(prefix)) return null;
      return [...sealed.slice(prefix.length)].reverse().join('');
    },
  };
}

export interface StubAiGatewayOptions {
  readonly models?: readonly AiModel[];
  /** The key the fake provider accepts. Any other key is rejected. */
  readonly acceptedKey?: string | null;
  readonly failure?: AiGatewayError;
  readonly reply?: (messages: readonly AssistantMessage[]) => string;
}

/** A provider that answers from memory, recording what it was asked. */
export function stubAiGateway(options: StubAiGatewayOptions = {}) {
  const calls: { connection: AiConnection; system?: string; model?: string }[] = [];

  const check = (connection: AiConnection): Result<true, AiGatewayError> => {
    if (options.failure !== undefined) return err(options.failure);
    if (options.acceptedKey !== undefined && connection.apiKey !== options.acceptedKey) {
      return err({ kind: 'AiKeyRejected' });
    }
    return ok(true);
  };

  const gateway: AiGateway = {
    listModels(connection) {
      calls.push({ connection });
      const checked = check(connection);
      return Promise.resolve(
        checked.ok ? ok(options.models ?? [{ id: 'stub-model', label: 'Stub model' }]) : checked,
      );
    },
    chat(connection, request) {
      calls.push({ connection, system: request.system, model: request.model });
      const checked = check(connection);
      if (!checked.ok) return Promise.resolve(checked);
      const last = request.messages.at(-1)?.content ?? '';
      return Promise.resolve(ok(options.reply?.(request.messages) ?? `echo: ${last}`));
    },
  };

  return { gateway, calls };
}
