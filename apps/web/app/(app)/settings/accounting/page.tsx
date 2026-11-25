import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { readCompanyAccountMapping } from '@/api/accounting-mapping';
import { Screen } from '@/ui/shell';
import { SettingsNav } from '@/ui/settings-nav';
import { NoAccess } from '@/ui/no-access';
import { buttonClasses } from '@/ui/button';
import { AccountingMappingForm } from '@/ui/accounting-mapping-form';

export default async function SettingsAccountingPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title={t('settings.title')}>
        <SettingsNav current="accounting" actor={ctx.actor} />
        <NoAccess />
      </Screen>
    );
  }

  const accounts = await listAccounts().catch(() => []);
  const defaults = await readCompanyAccountMapping(ctx.tenantId, accounts);
  const canWrite = can(ctx.actor, 'accounting:write') || ctx.actor.role === 'owner';

  return (
    <Screen
      title={t('settings.title')}
      subtitle="Seleccioná la cuenta contable que seguirá cada flujo operativo de la empresa"
    >
      <SettingsNav current="accounting" actor={ctx.actor} />

      <div className="max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Si un producto define su propia cuenta en su ficha, prevalece sobre la cuenta por
            defecto de la empresa.
          </p>
          <Link href="/accounting" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Ir al Plan de Cuentas
          </Link>
        </div>

        <AccountingMappingForm accounts={accounts} defaults={defaults} canWrite={canWrite} />
      </div>
    </Screen>
  );
}
