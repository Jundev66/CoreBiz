import { ok, err, can, ExchangeRate, type Result } from '@corebiz/domain';
import type { Clock } from '../../ports/clock';
import type { TenantContext, UnitOfWork } from '../../ports/repositories';
import type { TenantSettingsUpdate } from '../../ports/administration';

/**
 * Caso de uso: cambiar los ajustes de la empresa.
 *
 * Cuatro campos y tres de ellos con mas consecuencias de las que aparentan:
 *
 *   - La TASA DE CAMBIO no reescribe nada del pasado. Cada documento congela la
 *     suya al emitirse, asi que cambiarla aqui solo afecta a lo que se emita a
 *     partir de ahora. Es justo lo contrario de lo que hace la mayoria de los
 *     sistemas pequenos, y es la razon de que reimprimir una nota de marzo siga
 *     diciendo lo que decia en marzo.
 *
 *   - La MONEDA BASE cambia en que moneda se expresan los precios nuevos. No
 *     convierte el catalogo: convertirlo automaticamente redondearia cada precio
 *     y dejaria el catalogo lleno de cifras que nadie eligio.
 *
 *   - La TASA DEL IMPUESTO es informativa. No es un tributo declarado y este
 *     archivo no la trata como tal; lo unico que se comprueba es que este dentro
 *     de un rango que tenga sentido.
 */

export interface UpdateTenantSettingsInput {
  readonly name?: string;
  readonly taxLabel?: string;
  /** Puntos basicos: 1600 = 16,00 %. */
  readonly taxRateBp?: number;
  readonly baseCurrency?: string;
  /** Decimal en texto: "36.50". Se valida con el value object del dominio. */
  readonly exchangeRate?: string;
}

export type UpdateTenantSettingsError =
  | { kind: 'Forbidden' }
  | { kind: 'InvalidTaxRate'; raw: number }
  | { kind: 'InvalidCurrency'; raw: string }
  | { kind: 'InvalidExchangeRate'; raw: string }
  | { kind: 'TooShort'; field: string };

export interface UpdateTenantSettingsDeps {
  readonly uow: UnitOfWork;
  readonly ctx: TenantContext;
  readonly clock: Clock;
}

export function makeUpdateTenantSettings(deps: UpdateTenantSettingsDeps) {
  return async function updateTenantSettings(
    input: UpdateTenantSettingsInput,
  ): Promise<Result<TenantSettingsUpdate, UpdateTenantSettingsError>> {
    if (!can(deps.ctx.actor, 'settings:write')) {
      return err({ kind: 'Forbidden' });
    }

    const patch: {
      name?: string;
      taxLabel?: string;
      taxRateBp?: number;
      baseCurrency?: 'USD' | 'VES';
      exchangeRateScaled?: bigint;
      exchangeRateAt?: Date;
    } = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2) return err({ kind: 'TooShort', field: 'name' });
      patch.name = name;
    }

    if (input.taxLabel !== undefined) {
      const label = input.taxLabel.trim();
      if (label.length < 2) return err({ kind: 'TooShort', field: 'taxLabel' });
      patch.taxLabel = label;
    }

    if (input.taxRateBp !== undefined) {
      // 10000 puntos basicos es el 100 %. Por encima no es una tasa, es un error
      // de unidades — casi siempre alguien escribiendo 16 donde iba 1600.
      if (!Number.isInteger(input.taxRateBp) || input.taxRateBp < 0 || input.taxRateBp > 10_000) {
        return err({ kind: 'InvalidTaxRate', raw: input.taxRateBp });
      }
      patch.taxRateBp = input.taxRateBp;
    }

    const currency = input.baseCurrency ?? deps.ctx.settings.baseCurrency;
    if (input.baseCurrency !== undefined) {
      if (input.baseCurrency !== 'USD' && input.baseCurrency !== 'VES') {
        return err({ kind: 'InvalidCurrency', raw: input.baseCurrency });
      }
      patch.baseCurrency = input.baseCurrency;
    }

    if (input.exchangeRate !== undefined && input.exchangeRate.trim() !== '') {
      // La validacion la hace el value object, no una expresion regular de aqui:
      // es el mismo codigo que despues convierte los totales, asi que lo que
      // acepte el ajuste es exactamente lo que sabra usar el documento.
      const parsed = ExchangeRate.of(
        input.exchangeRate,
        currency === 'USD' ? 'USD' : 'VES',
        currency === 'USD' ? 'VES' : 'USD',
        deps.clock.now(),
      );
      if (!parsed.ok) return err({ kind: 'InvalidExchangeRate', raw: input.exchangeRate });

      patch.exchangeRateScaled = parsed.value.scaledRate;
      // La FECHA de captura se guarda junto a la tasa. Sin ella, el dato invita a
      // leerse como "la tasa de hoy", que es justo lo que deja de ser al dia
      // siguiente.
      patch.exchangeRateAt = deps.clock.now();
    }

    return deps.uow.run(async (repos) => {
      await repos.settings.update(patch);

      await repos.audit.record({
        action: 'tenant.settings_updated',
        entityType: 'tenant',
        entityId: deps.ctx.tenantId,
        diff: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.taxLabel !== undefined ? { taxLabel: patch.taxLabel } : {}),
          ...(patch.taxRateBp !== undefined ? { taxRateBp: patch.taxRateBp } : {}),
          ...(patch.baseCurrency !== undefined ? { baseCurrency: patch.baseCurrency } : {}),
          ...(patch.exchangeRateScaled !== undefined
            ? { exchangeRate: patch.exchangeRateScaled.toString() }
            : {}),
        },
      });

      return ok(patch);
    });
  };
}
