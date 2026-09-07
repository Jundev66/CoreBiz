import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  demoCapacity,
  demoSandboxIsAlive,
  provisionDemoSandbox,
  purgeExpiredDemos,
} from '../src/drizzle/demo';
import { TEST_DATABASE_URL, closeTestDatabase, testDb } from './support/database';

/**
 * El sandbox efimero.
 *
 * Lo que se comprueba aqui no es que el clonado "funcione" —eso lo diria
 * cualquier conteo de filas— sino que la copia sea COHERENTE. Un sandbox con
 * productos pero sin sus movimientos, o con notas apuntando a clientes que no se
 * copiaron, es peor que ninguno: el visitante ve un sistema roto y piensa que
 * asi es como funciona.
 */

const db = testDb();
const TEMPLATE = '00000000-0000-4000-8000-000000000001';

afterAll(closeTestDatabase);

async function dropSandboxes(): Promise<void> {
  await db.execute(sql`delete from public.tenants where is_demo and id <> ${TEMPLATE}::uuid`);
}

describe('Sandbox de demostracion', () => {
  beforeEach(dropSandboxes);

  const clone = (overrides: { maxConcurrent?: number; template?: string } = {}) =>
    provisionDemoSandbox(TEST_DATABASE_URL, {
      templateTenantId: overrides.template ?? TEMPLATE,
      ipHash: 'hash-de-prueba',
      ttlHours: 24,
      maxConcurrent: overrides.maxConcurrent ?? 50,
    });

  it('clona la plantilla entera y el libro mayor sigue cuadrando', async () => {
    const result = await clone();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Se compara el clon contra SU PLANTILLA, no contra numeros escritos a mano.
    // Fijar "8 clientes" haria que este test dependiera de que nadie haya tocado
    // la plantilla antes — y la suite E2E le da de alta clientes. Ademas, lo que
    // hay que comprobar es la FIDELIDAD de la copia, no el tamano de la semilla.
    const rows = await db.execute(sql`
      select
        (select count(*) from public.customers where tenant_id = ${TEMPLATE}::uuid)::int as clientes_origen,
        (select count(*) from public.customers where tenant_id = ${result.tenantId}::uuid)::int as clientes_copia,
        (select count(*) from public.products where tenant_id = ${TEMPLATE}::uuid)::int as productos_origen,
        (select count(*) from public.products where tenant_id = ${result.tenantId}::uuid)::int as productos_copia,
        (select count(*) from public.delivery_notes where tenant_id = ${TEMPLATE}::uuid)::int as notas_origen,
        (select count(*) from public.delivery_notes where tenant_id = ${result.tenantId}::uuid)::int as notas_copia,
        (select count(*) from public.delivery_note_lines where tenant_id = ${TEMPLATE}::uuid)::int as lineas_origen,
        (select count(*) from public.delivery_note_lines where tenant_id = ${result.tenantId}::uuid)::int as lineas_copia
    `);

    const counts = rows[0] as Record<string, number>;
    expect(Number(counts.clientes_copia)).toBe(Number(counts.clientes_origen));
    expect(Number(counts.productos_copia)).toBe(Number(counts.productos_origen));
    expect(Number(counts.notas_copia)).toBe(Number(counts.notas_origen));
    expect(Number(counts.lineas_copia)).toBe(Number(counts.lineas_origen));

    // Y que la plantilla no estuviera vacia, para que lo anterior signifique algo.
    expect(Number(counts.clientes_origen)).toBeGreaterThan(0);
    expect(Number(counts.lineas_origen)).toBeGreaterThan(0);

    // La comprobacion que de verdad importa: el saldo de cada producto del
    // sandbox lo explican SUS PROPIOS movimientos. Si el remapeo de claves
    // fallara, los movimientos apuntarian a productos de la plantilla y esto
    // saldria descuadrado.
    const descuadres = await db.execute(sql`
      select p.sku
        from public.products p
        left join public.stock_movements m on m.product_id = p.id
       where p.tenant_id = ${result.tenantId}::uuid and p.track_stock
       group by p.sku, p.on_hand
      having p.on_hand <> coalesce(sum(m.quantity), 0)
    `);
    expect(descuadres).toHaveLength(0);

    // Y las lineas apuntan a documentos y productos DEL SANDBOX, no de la
    // plantilla. Una sola linea cruzada seria una fuga entre demostraciones.
    const cruzadas = await db.execute(sql`
      select 1
        from public.delivery_note_lines l
        left join public.delivery_notes dn on dn.id = l.delivery_note_id
        left join public.products p on p.id = l.product_id
       where l.tenant_id = ${result.tenantId}::uuid
         and (dn.tenant_id <> ${result.tenantId}::uuid or p.tenant_id <> ${result.tenantId}::uuid)
    `);
    expect(cruzadas).toHaveLength(0);
  });

  it('no copia el registro de auditoria', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // El visitante tiene que ver aparecer en el visor lo que ACABA de hacer, no
    // el historial de otro. Es la unica tabla que se deja atras a proposito.
    const rows = await db.execute(sql`
      select 1 from public.audit_log where tenant_id = ${result.tenantId}::uuid
    `);
    expect(rows).toHaveLength(0);
  });

  it('el correlativo continua donde lo dejo la plantilla', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await db.execute(sql`
      select
        (select next_number::int from public.document_sequences
          where tenant_id = ${TEMPLATE}::uuid and doc_type = 'delivery_note') as origen,
        (select next_number::int from public.document_sequences
          where tenant_id = ${result.tenantId}::uuid and doc_type = 'delivery_note') as copia
    `);

    const seq = rows[0] as { origen: number; copia: number };

    // Empezar en uno haria que la primera nota del visitante chocara contra el
    // indice unico (tenant_id, number) de las que se acaban de copiar.
    expect(Number(seq.copia)).toBe(Number(seq.origen));
    expect(Number(seq.origen)).toBeGreaterThan(1);
  });

  it('se niega a clonar algo que no sea una plantilla de demostracion', async () => {
    // Sin esta guarda, un parametro equivocado copiaria la empresa de un cliente
    // real y la serviria a un visitante anonimo.
    const result = await clone({ template: '00000000-0000-4000-8000-000000000999' });
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
  });

  it('deja de crear sandboxes al llegar al tope de concurrentes', async () => {
    expect((await clone({ maxConcurrent: 1 })).ok).toBe(true);

    // Degrada en lugar de fallar: quien llega ve la plantilla compartida, no un
    // error de cuota. Un error en el enlace del CV es el peor resultado posible.
    expect(await clone({ maxConcurrent: 1 })).toMatchObject({
      ok: false,
      reason: 'at_capacity',
    });
  });

  it('un sandbox caducado deja de estar vivo y la purga se lo lleva', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await demoSandboxIsAlive(TEST_DATABASE_URL, result.tenantId)).toBe(true);

    await db.execute(sql`
      update public.tenants set expires_at = now() - interval '1 minute'
       where id = ${result.tenantId}::uuid
    `);

    // Caducado deja de ser accesible EN EL ACTO, sin esperar al cron. La purga
    // es higiene de espacio; la caducidad es la medida de seguridad.
    expect(await demoSandboxIsAlive(TEST_DATABASE_URL, result.tenantId)).toBe(false);
    expect(await purgeExpiredDemos(TEST_DATABASE_URL)).toBeGreaterThanOrEqual(1);

    const rows = await db.execute(sql`
      select 1 from public.tenants where id = ${result.tenantId}::uuid
    `);
    expect(rows).toHaveLength(0);
  });

  it('la purga nunca se lleva la plantilla', async () => {
    // Un `expires_at` puesto por error en la plantilla borraria la demostracion
    // entera y no quedaria nada que clonar. La guarda va explicita en el SQL.
    await db.execute(sql`
      update public.tenants set expires_at = now() - interval '1 day' where id = ${TEMPLATE}::uuid
    `);

    await purgeExpiredDemos(TEST_DATABASE_URL);

    const rows = await db.execute(sql`select 1 from public.tenants where id = ${TEMPLATE}::uuid`);
    expect(rows).toHaveLength(1);

    await db.execute(sql`update public.tenants set expires_at = null where id = ${TEMPLATE}::uuid`);
  });

  it('informa del modo segun el presupuesto de espacio', async () => {
    expect((await demoCapacity(TEST_DATABASE_URL)).mode).toBe('normal');

    // Con un presupuesto absurdamente pequeno el disyuntor tiene que saltar. Se
    // comprueba el UMBRAL y no el tamano de la base: el tamano cambia con cada
    // test que corra antes, y fijarlo haria esto dependiente del orden.
    const apretado = await demoCapacity(TEST_DATABASE_URL, 1_000);
    expect(apretado.mode).toBe('critical');
    expect(apretado.ratio).toBeGreaterThan(0.85);
  });
});
