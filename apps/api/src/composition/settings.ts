import type { TenantContext } from '@corebiz/application';
import type { TenantProfile } from '@corebiz/infrastructure';

/**
 * Ajustes por defecto del tenant.
 *
 * En modo memoria son la unica fuente. Sobre Postgres se usan solo como respaldo si
 * el perfil no se pudo leer, y los valores reales salen de la fila `tenants`: cambiar
 * el plan o la tasa de cambio en la base tiene que tener efecto de inmediato, y si
 * estos valores fueran la verdad la pantalla diria una cosa y las politicas otra.
 */
export const DEMO_SETTINGS: TenantContext['settings'] = {
  taxLabel: 'Impuesto informativo',
  taxRateBp: 1600,
  baseCurrency: 'USD',
  exchangeRateScaled: 3_650_000_000n,
  exchangeRateAt: new Date('2026-09-01T00:00:00.000Z'),
};

export function settingsFrom(profile: TenantProfile): TenantContext['settings'] {
  return {
    taxLabel: profile.taxLabel,
    taxRateBp: profile.taxRateBp,
    baseCurrency: profile.baseCurrency === 'VES' ? 'VES' : 'USD',
    exchangeRateScaled: profile.exchangeRateScaled,
    exchangeRateAt: profile.exchangeRateAt,
  };
}

/** Un plan desconocido en la fila degrada a `free`; nunca escala a `pro`. */
export function planFrom(code: string): 'free' | 'pro' {
  return code === 'pro' ? 'pro' : 'free';
}
