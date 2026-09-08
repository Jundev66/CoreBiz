import { Inject, Injectable, Scope, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Feature } from '@corebiz/domain';
import type { TenantContext } from '@corebiz/application';
import { TENANT_CONTEXT } from '../tokens';
import { domainError } from '../http/api-error';
import { REQUIRED_FEATURE } from './require-feature.decorator';

/**
 * El limite del PLAN, aplicado en el servidor.
 *
 * Este guard existe por un agujero que abrio la propia migracion a una API, y conviene
 * dejarlo escrito porque explica por que no basta con gatear en la pantalla.
 *
 * Antes, `reports` y `purchasing` se comprobaban en el Server Component de su pagina, y
 * eso bastaba: no habia otra forma de llegar a esas consultas. Al exponer el lado de
 * LECTURA por HTTP, cualquiera con una sesion del plan gratuito podia pedir
 * `GET /v1/reports/sales-summary` y recibir el reporte entero. Se comprobo: respondia
 * 200 con los datos dentro.
 *
 * Es el mismo argumento que ya estaba escrito en las Server Actions —«ocultar un boton
 * no es una medida de seguridad, porque se puede invocar directamente»— con mas fuerza,
 * porque ahora hay una API publica a la que invocar.
 *
 * QUE ES Y QUE NO ES. No es una fuga de datos: Row Level Security sigue confinando cada
 * peticion a la empresa de quien llama, y lo que se alcanzaba eran los datos PROPIOS.
 * Es una barrera de monetizacion que se podia saltar, que es un fallo distinto y menos
 * grave — pero un fallo.
 *
 * En las ESCRITURAS la autoridad sigue siendo el caso de uso, que devuelve
 * `FeatureNotAvailable` por su cuenta; aqui el guard solo se adelanta para no abrir una
 * transaccion. En las LECTURAS no hay caso de uso —son consultas planas, CQRS ligero—
 * asi que este guard SI es la autoridad. Es la unica asimetria del sistema y merece
 * saberse antes de mover el gate a otro sitio.
 */
@Injectable({ scope: Scope.REQUEST })
export class FeatureGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Feature | undefined>(REQUIRED_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined) return true;

    const gate = this.ctx.plan.checkFeature(required);
    if (gate.ok) return true;

    // Se responde con la MISMA clave y los mismos parametros que devuelve el dominio,
    // para que la interfaz no tenga que distinguir si el no vino del guard o del caso
    // de uso. Si divergieran, la mitad de los avisos de "sube de plan" dejarian de
    // pintarse y nadie sabria por que unos si y otros no.
    throw domainError(gate.error.kind, {
      feature: gate.error.feature,
      requiredPlan: gate.error.requiredPlan,
    });
  }
}
