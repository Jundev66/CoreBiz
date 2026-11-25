import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { listAccounts } from '@/api/accounting';
import { Screen, TableFrame } from '@/ui/shell';
import { Card } from '@/ui/primitives';
import { Badge } from '@/ui/feedback';
import { SettingsNav } from '@/ui/settings-nav';
import { NoAccess } from '@/ui/no-access';
import { buttonClasses } from '@/ui/button';

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

  const findAccount = (codes: string[], category: string) =>
    accounts.find((a) => codes.includes(a.code)) ?? accounts.find((a) => a.category === category);

  const defaults = [
    {
      role: 'Caja y Bancos (Contado / Cobros)',
      account: findAccount(['1.1.01', '1010'], 'ASSET'),
      scope: 'Empresa',
    },
    {
      role: 'Cuentas por Cobrar (Ventas a Crédito)',
      account: findAccount(['1.1.02', '1200'], 'ASSET'),
      scope: 'Empresa',
    },
    {
      role: 'Inventario de Mercancías',
      account: findAccount(['1.1.03', '1400'], 'ASSET'),
      scope: 'Empresa / Ítem',
    },
    {
      role: 'Cuentas por Pagar (Proveedores)',
      account: findAccount(['2.1.01', '2010'], 'LIABILITY'),
      scope: 'Empresa',
    },
    {
      role: 'Débito Fiscal IVA / Sales Tax por Pagar',
      account: findAccount(['2.1.02', '2050'], 'LIABILITY'),
      scope: 'Empresa',
    },
    {
      role: 'Ingresos por Ventas',
      account: findAccount(['4.1.01', '4010'], 'REVENUE'),
      scope: 'Empresa / Ítem',
    },
    {
      role: 'Costo de Ventas',
      account: findAccount(['5.1.01', '5010'], 'COGS'),
      scope: 'Empresa',
    },
  ];

  return (
    <Screen
      title={t('settings.title')}
      subtitle="Determinación automática de cuentas contables por empresa y por ítem"
    >
      <SettingsNav current="accounting" actor={ctx.actor} />

      <div className="max-w-4xl space-y-6">
        <Card className="p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Mapeo Contable de la Empresa ({ctx.settings.fiscalCountry ?? 'VE'})
              </h2>
              <p className="mt-1 text-sm text-muted">
                Si un producto tiene su propia cuenta configurada en su ficha, prevalece sobre la
                cuenta por defecto de la empresa.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/accounting"
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                Ver Plan de Cuentas
              </Link>
              <Link href="/products" className={buttonClasses({ size: 'sm' })}>
                Configurar por Ítem
              </Link>
            </div>
          </div>
        </Card>

        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-subtle text-xs font-semibold text-muted">
              <th className="px-4 py-3">Función Contable</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Cuenta Asignada</th>
              <th className="px-4 py-3 text-center">Nivel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {defaults.map((row) => (
              <tr key={row.role} className="hover:bg-subtle/40">
                <td className="px-4 py-3 font-medium text-ink">{row.role}</td>
                <td className="px-4 py-3 font-mono text-sm text-brand">
                  {row.account?.code ?? '—'}
                </td>
                <td className="px-4 py-3 text-ink">{row.account?.name ?? 'Sin cuenta asignada'}</td>
                <td className="px-4 py-3 text-center">
                  <Badge tone={row.scope.includes('Ítem') ? 'brand' : 'neutral'}>{row.scope}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </div>
    </Screen>
  );
}
