import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listTaxRateConfigs } from '@/api/fiscal';
import { createTaxRateAction, setDefaultTaxRateAction } from '@/actions/taxes';
import { Screen, TableFrame } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { Badge } from '@/ui/feedback';
import { buttonClasses } from '@/ui/button';
import { CONTROL_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { SettingsNav } from '@/ui/settings-nav';
import { NoAccess } from '@/ui/no-access';

export default async function SettingsTaxesPage() {
  const t = await getTranslations();
  const { ctx } = await apiForRequest();

  if (!can(ctx.actor, 'settings:read')) {
    return (
      <Screen title={t('settings.title')}>
        <SettingsNav current="taxes" actor={ctx.actor} />
        <NoAccess />
      </Screen>
    );
  }

  const taxRates = await listTaxRateConfigs().catch(() => []);
  const canWrite = can(ctx.actor, 'settings:write');
  const jurisdiction = ctx.settings.fiscalCountry ?? 'VE';

  return (
    <Screen
      title={t('settings.title')}
      subtitle="Catálogo de alícuotas e impuestos configurables por jurisdicción y empresa"
    >
      <SettingsNav current="taxes" actor={ctx.actor} />

      <div className="max-w-4xl space-y-6">
        {canWrite && (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-ink">Agregar Nuevo Impuesto</h2>
            <form action={createTaxRateAction} className="grid gap-4 sm:grid-cols-4 sm:items-end">
              <input type="hidden" name="jurisdiction" value={jurisdiction} />
              <div>
                <label htmlFor="tax-code" className={LABEL_CLASSES}>
                  Código
                </label>
                <input
                  id="tax-code"
                  name="code"
                  type="text"
                  required
                  placeholder="IVA_31"
                  className={`mt-1.5 font-mono uppercase ${CONTROL_CLASSES}`}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="tax-name" className={LABEL_CLASSES}>
                  Nombre del Impuesto
                </label>
                <input
                  id="tax-name"
                  name="name"
                  type="text"
                  required
                  placeholder="IVA Suntuario (31%)"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                />
              </div>

              <div>
                <label htmlFor="tax-rate" className={LABEL_CLASSES}>
                  Porcentaje (%)
                </label>
                <input
                  id="tax-rate"
                  name="ratePercent"
                  type="text"
                  required
                  placeholder="31"
                  className={`mt-1.5 text-right ${CONTROL_CLASSES}`}
                />
              </div>

              <div className="flex items-center justify-between sm:col-span-4 pt-2 border-t border-line">
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="checkbox" name="isDefault" className="size-4 accent-brand" />
                  <span>Establecer como impuesto por defecto de la empresa</span>
                </label>
                <button type="submit" className={buttonClasses({ size: 'sm' })}>
                  Crear Impuesto
                </button>
              </div>
            </form>
          </Card>
        )}

        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-right">Alícuota</th>
              <th className="px-4 py-3 text-center">Jurisdicción</th>
              <th className="px-4 py-3 text-center">Predeterminado</th>
              {canWrite && <th className="px-4 py-3 text-right">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {taxRates.map((rate) => (
              <tr key={rate.id} className="hover:bg-subtle/40">
                <td className="px-4 py-3 font-mono font-medium text-brand">{rate.code}</td>
                <td className="px-4 py-3 font-medium text-ink">{rate.name}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">
                  {(rate.rateBp / 100).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs text-muted">
                  {rate.jurisdiction}
                </td>
                <td className="px-4 py-3 text-center">
                  {rate.isDefault ? (
                    <Badge tone="success">Por defecto</Badge>
                  ) : (
                    <Badge tone="neutral">Disponible</Badge>
                  )}
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    {!rate.isDefault && (
                      <form action={setDefaultTaxRateAction}>
                        <input type="hidden" name="id" value={rate.id} />
                        <button
                          type="submit"
                          className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle"
                        >
                          Hacer Predeterminado
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </div>
    </Screen>
  );
}
