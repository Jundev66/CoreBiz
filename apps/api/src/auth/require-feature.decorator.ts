import { SetMetadata } from '@nestjs/common';
import type { Feature } from '@corebiz/domain';

export const REQUIRED_FEATURE = 'corebiz:required-feature';

/**
 * Declara que funcionalidad de PLAN hace falta para llegar a un manejador.
 *
 * Es distinto de `@RequirePermission`, y la diferencia importa porque la interfaz las
 * trata de forma opuesta: un permiso que falta significa "tu rol no puede hacer esto"
 * y se responde con `Forbidden`; una funcionalidad que falta significa "tu plan no
 * incluye esto" y se responde con `FeatureNotAvailable` y el plan necesario dentro,
 * para que la pantalla pueda ofrecer subir de plan en lugar de decir que no tienes
 * permiso — que seria mentira y ademas perderia la venta.
 *
 * La funcionalidad es del DOMINIO (`packages/domain/src/billing/plan.ts`), no una
 * cadena inventada aqui.
 */
export const RequireFeature = (feature: Feature) => SetMetadata(REQUIRED_FEATURE, feature);
