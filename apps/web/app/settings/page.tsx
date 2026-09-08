import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { Shell, QuotaBar } from '@/ui/shell';
import { SettingsNav } from '@/ui/settings-nav';
import { TenantSettingsForm } from '@/ui/tenant-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('settings.title') };
}

/**
 * Ajustes de la empresa y consumo del plan.
 *
 * Los dos van en la misma pantalla a proposito: son las dos preguntas que se
 * hace quien entra aqui —"como esta configurado esto" y "cuanto me queda"— y
 * separarlas obligaria a recordar cual estaba en cual.
 *
 * Los recursos que se muestran son los cuatro que le importan a diario a quien
 * lleva el negocio. `suppliers` tambien se cuenta —lo consume el alta de
 * proveedores— pero vive detras del plan PRO, y ensenarlo aqui a quien esta en el
 * gratuito seria pintar una barra que no puede mover.
 */
const TRACKED = ['customers', 'products', 'users', 'documents_month'] as const;

export default async function SettingsPage() {
  const t = await getTranslations();
  const { ctx, session, queries } = await forRequest();

  const usage = await Promise.all(
    TRACKED.map(async (resource) => ({
      resource,
      quota: ctx.plan.quota(resource, await queries.usage.current(resource)),
    })),
  );

  const canWrite = ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
    >
      <SettingsNav current="business" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="business-heading">
          <h2 id="business-heading" className="mb-1 text-lg font-medium">
            {t('settings.business.heading')}
          </h2>
          <p className="mb-6 text-sm text-[var(--color-muted)]">
            {t('settings.business.description')}
          </p>

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
        </section>

        <section aria-labelledby="plan-heading">
          <h2 id="plan-heading" className="mb-1 text-lg font-medium">
            {t('settings.plan.heading', { plan: ctx.plan.code.toUpperCase() })}
          </h2>
          <p className="mb-6 text-sm text-[var(--color-muted)]">{t('settings.plan.description')}</p>

          <ul className="space-y-5">
            {usage.map(({ resource, quota }) => (
              <li key={resource}>
                <QuotaBar
                  current={quota.current}
                  limit={quota.limit}
                  label={t('quota.usage', {
                    current: quota.current,
                    limit: quota.limit,
                    resource: t(`settings.resources.${resource}`),
                  })}
                  nearLimitLabel={t('quota.nearLimit')}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}

/** 3_650_000_000n -> "36.5". La tasa vive escalada x10^8. */
function formatRate(scaled: bigint): string {
  const whole = scaled / 100_000_000n;
  const fraction = (scaled % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}
