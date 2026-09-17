import { isAiProvider, type TenantId, type UserId } from '@corebiz/domain';
import type { AiSettingsRecord, AiSettingsRepository } from '@corebiz/application';
import type { Tx } from './session';

/** The company's AI connection. Filtered by tenant as well as by RLS, like every adapter. */
export class PrismaAiSettingsRepository implements AiSettingsRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
    private readonly actorId: UserId,
  ) {}

  async find(): Promise<AiSettingsRecord | null> {
    const row = await this.tx.tenant_ai_settings.findFirst({
      where: { tenant_id: this.tenantId },
    });
    // The CHECK constraint already limits `provider`. A value outside it means the table and
    // this code disagree, and "not configured" is the safe reading.
    if (row === null || !isAiProvider(row.provider)) return null;

    return {
      provider: row.provider,
      baseUrl: row.base_url,
      apiKeyCiphertext: row.api_key_ciphertext,
      apiKeyHint: row.api_key_hint,
      model: row.model,
      updatedAt: row.updated_at,
    };
  }

  async save(record: AiSettingsRecord): Promise<void> {
    const values = {
      provider: record.provider,
      base_url: record.baseUrl,
      api_key_ciphertext: record.apiKeyCiphertext,
      api_key_hint: record.apiKeyHint,
      model: record.model,
      updated_by: this.actorId,
      updated_at: record.updatedAt,
    };

    await this.tx.tenant_ai_settings.upsert({
      where: { tenant_id: this.tenantId },
      create: { tenant_id: this.tenantId, ...values },
      update: values,
    });
  }

  async remove(): Promise<void> {
    await this.tx.tenant_ai_settings.deleteMany({ where: { tenant_id: this.tenantId } });
  }
}
