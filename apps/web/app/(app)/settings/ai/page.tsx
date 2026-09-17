import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { aiSettings } from '@/api/ai';
import { withSession } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { SettingsNav } from '@/ui/settings-nav';
import { NoAccess } from '@/ui/no-access';
import { AiSettingsForm } from '@/ui/ai-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('settings.tabs.ai') };
}

/**
 * Where a company connects the assistant to an AI provider.
 *
 * Owner and admin only. Like the team screen, the API's 403 for other roles renders as "not
 * for you" instead of a broken page.
 */
export default async function AiSettingsPage() {
  const t = await getTranslations();
  // `withSession` turns a 403 into `data === null`; a company without AI is `settings: null`.
  const { ctx, data } = await withSession(() => aiSettings());

  if (!can(ctx.actor, 'ai:configure') || data === null) {
    return (
      <Screen title={t('settings.title')}>
        <SettingsNav current="ai" actor={ctx.actor} />
        <NoAccess />
      </Screen>
    );
  }

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <SettingsNav current="ai" actor={ctx.actor} />

      <section aria-labelledby="ai-heading" className="max-w-3xl">
        <h2 id="ai-heading" className="text-base font-semibold text-ink">
          {t('settings.ai.heading')}
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">{t('settings.ai.description')}</p>

        <Card className="p-5 sm:p-6">
          <AiSettingsForm saved={data.settings} />
        </Card>
      </section>
    </Screen>
  );
}
