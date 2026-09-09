import type { TenantId } from '@corebiz/domain';
import type { Clock, UsageCounter } from '@corebiz/application';
import type { Tx } from './session';

/**
 * Deriva el periodo del nombre del recurso.
 *
 * El puerto no lo expresa —`current('customers')` no dice nada de fechas— pero la tabla lo
 * necesita en su clave. La convencion es el sufijo: `documents_month` se reinicia cada
 * mes, `customers` y `products` se acumulan para siempre. Vive aqui y no en el puerto
 * porque es un detalle de como se almacena, no de lo que el negocio pregunta.
 *
 * Lo comparten el contador de escritura y el lado de lectura: si cada uno calculara el
 * suyo, una discrepancia haria que la pantalla mostrase un consumo y la cuota bloquease
 * por otro.
 */
export function usagePeriod(resource: string, now: Date): string {
  if (!resource.endsWith('_month')) return 'total';
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

/**
 * Contadores de consumo del plan.
 *
 * Existen para que comprobar una cuota sea una lectura por clave primaria en lugar de un
 * `count(*)` sobre una tabla que crece. En un ERP se escribe constantemente; contar filas
 * en cada escritura degrada el sistema justo cuando mas se usa.
 */
export class PrismaUsageCounter implements UsageCounter {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
    private readonly clock: Clock,
  ) {}

  private periodFor(resource: string): string {
    return usagePeriod(resource, this.clock.now());
  }

  async current(resource: string): Promise<number> {
    const row = await this.tx.tenant_usage.findUnique({
      select: { count: true },
      where: {
        tenant_id_resource_period: {
          tenant_id: this.tenantId,
          resource,
          period: this.periodFor(resource),
        },
      },
    });

    // La columna es `bigint` y el puerto declara `number`. La conversion va en el
    // adaptador; el puerto no cambia por un detalle del motor.
    return row === null ? 0 : Number(row.count);
  }

  async increment(resource: string, amount = 1): Promise<void> {
    await this.tx.tenant_usage.upsert({
      where: {
        tenant_id_resource_period: {
          tenant_id: this.tenantId,
          resource,
          period: this.periodFor(resource),
        },
      },
      create: {
        tenant_id: this.tenantId,
        resource,
        period: this.periodFor(resource),
        count: amount,
      },
      // El incremento lo hace la base de datos sobre el valor actual, no la aplicacion
      // sobre un valor leido antes: entre la lectura y la escritura cabe otra transaccion,
      // y dos altas simultaneas contarian como una. `increment` de Prisma compila a
      // `count = count + $1`, que es exactamente eso.
      update: { count: { increment: amount } },
    });
  }

  async decrement(resource: string, amount = 1): Promise<void> {
    // ESTE VA EN SQL CRUDO, y no por gusto.
    //
    // El tope inferior es `greatest(0, count - amount)`, y Prisma no lo expresa: su
    // `{ decrement }` compila a `count = count - $1` a secas, que puede bajar de cero. La
    // tabla tiene una restriccion que lo impide, asi que restar de mas no corromperia el
    // dato — abortaria la transaccion entera, que es peor: una operacion legitima
    // fallaria por un contador descuadrado.
    //
    // El `on conflict` con la clave compuesta reproduce el upsert en una sola sentencia,
    // igual que el incremento.
    const period = this.periodFor(resource);
    await this.tx.$executeRaw`
      insert into public.tenant_usage (tenant_id, resource, period, count)
      values (${this.tenantId}::uuid, ${resource}, ${period}, 0)
      on conflict (tenant_id, resource, period)
      do update set count = greatest(0, public.tenant_usage.count - ${amount}::bigint)
    `;
  }
}
