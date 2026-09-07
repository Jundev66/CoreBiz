import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@corebiz/db';
import type { TenantId } from '@corebiz/domain';
import type { Clock, UsageCounter } from '@corebiz/application';
import type { Tx } from './tx';

const { tenantUsage } = schema;

/**
 * Deriva el periodo del nombre del recurso.
 *
 * El puerto no lo expresa —`current('customers')` no dice nada de fechas— pero la
 * tabla lo necesita en su clave. La convencion es el sufijo: `documents_month` se
 * reinicia cada mes, `customers` y `products` se acumulan para siempre. Vive aqui
 * y no en el puerto porque es un detalle de como se almacena, no de lo que el
 * negocio pregunta.
 *
 * Lo comparten el contador de escritura y el lado de lectura: si cada uno
 * calculara el suyo, una discrepancia haria que la pantalla mostrase un consumo y
 * la cuota bloquease por otro.
 */
export function usagePeriod(resource: string, now: Date): string {
  if (!resource.endsWith('_month')) return 'total';
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

/**
 * Contadores de consumo del plan.
 *
 * Existen para que comprobar una cuota sea una lectura por clave primaria en
 * lugar de un `count(*)` sobre una tabla que crece. En un ERP se escribe
 * constantemente; contar filas en cada escritura degrada el sistema justo cuando
 * mas se usa.
 */
export class DrizzleUsageCounter implements UsageCounter {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
    private readonly clock: Clock,
  ) {}

  private periodFor(resource: string): string {
    return usagePeriod(resource, this.clock.now());
  }

  async current(resource: string): Promise<number> {
    const rows = await this.tx
      .select({ count: tenantUsage.count })
      .from(tenantUsage)
      .where(
        and(
          eq(tenantUsage.tenantId, this.tenantId),
          eq(tenantUsage.resource, resource),
          eq(tenantUsage.period, this.periodFor(resource)),
        ),
      )
      .limit(1);

    return rows[0]?.count ?? 0;
  }

  async increment(resource: string, amount = 1): Promise<void> {
    await this.tx
      .insert(tenantUsage)
      .values({
        tenantId: this.tenantId,
        resource,
        period: this.periodFor(resource),
        count: amount,
      })
      .onConflictDoUpdate({
        target: [tenantUsage.tenantId, tenantUsage.resource, tenantUsage.period],
        // El incremento lo hace la base de datos sobre el valor actual, no la
        // aplicacion sobre un valor leido antes: entre la lectura y la escritura
        // cabe otra transaccion, y dos altas simultaneas contarian como una.
        set: { count: sql`${tenantUsage.count} + ${amount}` },
      });
  }

  async decrement(resource: string, amount = 1): Promise<void> {
    await this.tx
      .insert(tenantUsage)
      .values({
        tenantId: this.tenantId,
        resource,
        period: this.periodFor(resource),
        count: 0,
      })
      .onConflictDoUpdate({
        target: [tenantUsage.tenantId, tenantUsage.resource, tenantUsage.period],
        // Nunca por debajo de cero. La tabla lo comprueba tambien; aqui se evita
        // que la comprobacion salte y aborte una transaccion legitima.
        set: { count: sql`greatest(0, ${tenantUsage.count} - ${amount})` },
      });
  }
}
