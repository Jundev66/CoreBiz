import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Screen } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { SettingsNav } from '@/ui/settings-nav';
import { TenantSettingsForm } from '@/ui/tenant-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('settings.title') };
}

export default async function SettingsPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  const canWrite = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <SettingsNav current="business" actor={ctx.actor} />

      <section aria-labelledby="business-heading" className="max-w-3xl">
        <h2 id="business-heading" className="text-base font-semibold text-ink">
          {t('settings.business.heading')}
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">{t('settings.business.description')}</p>

        <Card className="p-5 sm:p-6">
          <TenantSettingsForm
            canWrite={canWrite}
            defaults={{
              taxLabel: ctx.settings.taxLabel,
              // En porcentaje porque es como se piensa y como se escribe: 16, no
              // 1600. La conversion a puntos basicos ocurre en el borde.
              taxRatePercent: (ctx.settings.taxRateBp / 100).toString(),
              baseCurrency: ctx.settings.baseCurrency,
              exchangeRate:
                ctx.settings.exchangeRateScaled === null
                  ? ''
                  : formatRate(ctx.settings.exchangeRateScaled),
            }}
          />
        </Card>
      </section>
    </Screen>
  );
}

/** 3_650_000_000n -> "36.5". La tasa vive escalada x10^8. */
function formatRate(scaled: bigint): string {
  const whole = scaled / 100_000_000n;
  const fraction = (scaled % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}
