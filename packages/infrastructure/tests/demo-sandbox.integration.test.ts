import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  demoCapacity,
  demoSandboxIsAlive,
  provisionDemoSandbox,
  purgeExpiredDemos,
} from '../src/prisma/demo';
import { TEST_DATABASE_URL, closeTestDatabase, testSql } from './support/database';

/**
 * El sandbox efimero y la cuenta que lo opera.
 *
 * Lo que se comprueba aqui no es que el clonado "funcione" —eso lo diria
 * cualquier conteo de filas— sino que la copia sea COHERENTE. Un sandbox con
 * productos pero sin sus movimientos, o con notas apuntando a clientes que no se
 * copiaron, es peor que ninguno: el visitante ve un sistema roto y piensa que
 * asi es como funciona.
 *
 * Y, desde que cada visitante tiene credenciales propias, que la cuenta nazca
 * utilizable y muera con su sandbox. Las dos mitades importan: una cuenta que no
 * puede entrar deja la demostracion inservible, y una que no se borra se acumula
 * en silencio hasta que llega el cobro.
 */

const sql = testSql();
const TEMPLATE = '00000000-0000-4000-8000-000000000001';

afterAll(closeTestDatabase);

/**
 * Deja la base como estaba.
 *
 * Borra tambien las CUENTAS de demostracion, y no solo sus tenants: las de los
 * visitantes degradados cuelgan de la plantilla, que no se borra nunca, asi que
 * limpiar solo tenants las dejaria acumulandose entre tests hasta que uno
 * empezase a fallar por un motivo que no tiene nada que ver con lo que prueba.
 */
async function dropSandboxes(): Promise<void> {
  await sql`delete from public.tenants where is_demo and id <> ${TEMPLATE}::uuid`;
  await sql`
    delete from auth.users
     where coalesce((raw_app_meta_data ->> 'is_demo')::boolean, false)
  `;
  await sql`delete from public.demo_sessions`;
}

describe('Sandbox de demostracion', () => {
  beforeEach(dropSandboxes);

  const clone = (
    overrides: { maxConcurrent?: number; template?: string; maxReadonlyPerHour?: number } = {},
  ) =>
    provisionDemoSandbox(TEST_DATABASE_URL, {
      templateTenantId: overrides.template ?? TEMPLATE,
      ipHash: 'hash-de-prueba',
      ttlHours: 24,
      maxConcurrent: overrides.maxConcurrent ?? 50,
      ...(overrides.maxReadonlyPerHour !== undefined
        ? { maxReadonlyPerHour: overrides.maxReadonlyPerHour }
        : {}),
    });

  it('clona la plantilla entera y el libro mayor sigue cuadrando', async () => {
    const result = await clone();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readonly).toBe(false);

    // Se compara el clon contra SU PLANTILLA, no contra numeros escritos a mano.
    // Fijar "8 clientes" haria que este test dependiera de que nadie haya tocado
    // la plantilla antes — y la suite E2E le da de alta clientes. Ademas, lo que
    // hay que comprobar es la FIDELIDAD de la copia, no el tamano de la semilla.
    const rows = await sql`
      select
        (select count(*) from public.customers where tenant_id = ${TEMPLATE}::uuid)::int as clientes_origen,
        (select count(*) from public.customers where tenant_id = ${result.tenantId}::uuid)::int as clientes_copia,
        (select count(*) from public.products where tenant_id = ${TEMPLATE}::uuid)::int as productos_origen,
        (select count(*) from public.products where tenant_id = ${result.tenantId}::uuid)::int as productos_copia,
        (select count(*) from public.delivery_notes where tenant_id = ${TEMPLATE}::uuid)::int as notas_origen,
        (select count(*) from public.delivery_notes where tenant_id = ${result.tenantId}::uuid)::int as notas_copia,
        (select count(*) from public.delivery_note_lines where tenant_id = ${TEMPLATE}::uuid)::int as lineas_origen,
        (select count(*) from public.delivery_note_lines where tenant_id = ${result.tenantId}::uuid)::int as lineas_copia
    `;

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
    const descuadres = await sql`
      select p.sku
        from public.products p
        left join public.stock_movements m on m.product_id = p.id
       where p.tenant_id = ${result.tenantId}::uuid and p.track_stock
       group by p.sku, p.on_hand
      having p.on_hand <> coalesce(sum(m.quantity), 0)
    `;
    expect(descuadres).toHaveLength(0);

    // Y las lineas apuntan a documentos y productos DEL SANDBOX, no de la
    // plantilla. Una sola linea cruzada seria una fuga entre demostraciones.
    const cruzadas = await sql`
      select 1
        from public.delivery_note_lines l
        left join public.delivery_notes dn on dn.id = l.delivery_note_id
        left join public.products p on p.id = l.product_id
       where l.tenant_id = ${result.tenantId}::uuid
         and (dn.tenant_id <> ${result.tenantId}::uuid or p.tenant_id <> ${result.tenantId}::uuid)
    `;
    expect(cruzadas).toHaveLength(0);
  });

  it('la cuenta que entrega nace utilizable', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await sql`
      select
        u.encrypted_password = extensions.crypt(${result.password}, u.encrypted_password) as clave_ok,
        u.email_confirmed_at is not null as confirmado,
        -- Las cuatro columnas de token en NULL hacen que GoTrue rechace el
        -- acceso entero con un error de esquema que no menciona la causa. Se
        -- comprueban aqui porque es un fallo que solo se ve intentando entrar.
        u.confirmation_token is not null
          and u.recovery_token is not null
          and u.email_change is not null
          and u.email_change_token_new is not null as tokens_no_nulos,
        (u.raw_app_meta_data ->> 'is_demo')::boolean as marcado,
        exists (select 1 from auth.identities i where i.user_id = u.id) as tiene_identidad
      from auth.users u
     where u.id = ${result.userId}::uuid
    `;

    expect(rows[0]).toMatchObject({
      clave_ok: true,
      confirmado: true,
      tokens_no_nulos: true,
      marcado: true,
      tiene_identidad: true,
    });
  });

  it('el visitante es dueno de su sandbox y de nada mas', async () => {
    const uno = await clone();
    const otro = await clone();
    expect(uno.ok && otro.ok).toBe(true);
    if (!uno.ok || !otro.ok) return;

    // Cada cuenta pertenece a UN tenant: el suyo. Si el clonado hubiera dejado
    // ademas la pertenencia copiada de la plantilla, una sola cuenta podria
    // recorrer todas las demostraciones abiertas.
    const rows = await sql`
      select m.user_id::text as usuario, m.tenant_id::text as tenant, m.role
        from public.memberships m
       where m.user_id in (${uno.userId}::uuid, ${otro.userId}::uuid)
    `;

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(
      expect.objectContaining({ usuario: uno.userId, tenant: uno.tenantId, role: 'owner' }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ usuario: otro.userId, tenant: otro.tenantId, role: 'owner' }),
    );
  });

  it('no copia el registro de auditoria', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // El visitante tiene que ver aparecer en el visor lo que ACABA de hacer, no
    // el historial de otro. Es la unica tabla que se deja atras a proposito.
    const rows = await sql`
      select 1 from public.audit_log where tenant_id = ${result.tenantId}::uuid
    `;
    expect(rows).toHaveLength(0);
  });

  it('el correlativo continua donde lo dejo la plantilla', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await sql`
      select
        (select next_number::int from public.document_sequences
          where tenant_id = ${TEMPLATE}::uuid and doc_type = 'delivery_note') as origen,
        (select next_number::int from public.document_sequences
          where tenant_id = ${result.tenantId}::uuid and doc_type = 'delivery_note') as copia
    `;

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

    // Y no deja la cuenta a medias: la identidad y los datos se crean en la
    // misma transaccion, asi que si el clonado falla no queda un usuario suelto.
    const huerfanos = await sql`
      select 1 from auth.users
       where coalesce((raw_app_meta_data ->> 'is_demo')::boolean, false)
    `;
    expect(huerfanos).toHaveLength(0);
  });

  it('al llegar al tope entrega acceso de solo lectura en vez de un error', async () => {
    expect((await clone({ maxConcurrent: 1 })).ok).toBe(true);

    // No se rechaza al visitante: se le degrada. Un "vuelve mas tarde" en el
    // enlace de un CV es el peor resultado posible, porque el momento en que
    // alguien lo abre no se repite.
    const degradado = await clone({ maxConcurrent: 1 });
    expect(degradado.ok).toBe(true);
    if (!degradado.ok) return;

    expect(degradado.readonly).toBe(true);

    // Entra en la PLANTILLA compartida y como `viewer`: sin eso, un visitante
    // degradado podria escribir en el tenant que todos los demas van a clonar, y
    // su alta aparecería en todas las copias posteriores.
    expect(degradado.tenantId).toBe(TEMPLATE);

    const rows = await sql`
      select role from public.memberships where user_id = ${degradado.userId}::uuid
    `;
    expect(rows).toEqual([{ role: 'viewer' }]);

    // Y no ha costado una copia de la base: sigue habiendo un solo sandbox.
    const capacidad = await demoCapacity(TEST_DATABASE_URL);
    expect(capacidad.activeSandboxes).toBe(1);
  });

  it('stops handing out read-only seats past the hourly ceiling', async () => {
    // Degraded mode used to create a user, identity, membership and session on every call
    // with nothing ever refusing, so the ceiling is what bounds it.
    const first = await clone({ maxConcurrent: 0, maxReadonlyPerHour: 1 });
    expect(first.ok && first.readonly).toBe(true);

    const second = await clone({ maxConcurrent: 0, maxReadonlyPerHour: 1 });
    expect(second).toEqual({ ok: false, reason: 'full' });
  });

  it('un sandbox caducado deja de estar vivo y la purga se lo lleva con su cuenta', async () => {
    const result = await clone();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await demoSandboxIsAlive(TEST_DATABASE_URL, result.tenantId)).toBe(true);

    await sql`
      update public.tenants set expires_at = now() - interval '1 minute'
       where id = ${result.tenantId}::uuid
    `;
    await sql`
      update public.demo_sessions set expires_at = now() - interval '1 minute'
       where tenant_id = ${result.tenantId}::uuid
    `;

    // Caducado deja de ser accesible EN EL ACTO, sin esperar al cron. La purga
    // es higiene de espacio; la caducidad es la medida de seguridad.
    expect(await demoSandboxIsAlive(TEST_DATABASE_URL, result.tenantId)).toBe(false);
    expect(await purgeExpiredDemos(TEST_DATABASE_URL)).toBeGreaterThanOrEqual(1);

    const tenant = await sql`
      select 1 from public.tenants where id = ${result.tenantId}::uuid
    `;
    expect(tenant).toHaveLength(0);

    // Y la cuenta se va con el. Una cuenta huerfana no rompe nada visible, y por
    // eso mismo se acumularia durante meses sin que nadie lo notase.
    const usuario = await sql`
      select 1 from auth.users where id = ${result.userId}::uuid
    `;
    expect(usuario).toHaveLength(0);
  });

  it('la purga tambien se lleva a los visitantes de solo lectura', async () => {
    // Cuelgan de la plantilla, que no caduca nunca. Si la purga solo mirase
    // tenants, estas cuentas se quedarian para siempre — y son justo las que
    // menos se notan.
    expect((await clone({ maxConcurrent: 1 })).ok).toBe(true);
    const degradado = await clone({ maxConcurrent: 1 });
    expect(degradado.ok).toBe(true);
    if (!degradado.ok) return;

    await sql`
      update public.demo_sessions set expires_at = now() - interval '1 minute'
       where user_id = ${degradado.userId}::uuid
    `;

    await purgeExpiredDemos(TEST_DATABASE_URL);

    const usuario = await sql`
      select 1 from auth.users where id = ${degradado.userId}::uuid
    `;
    expect(usuario).toHaveLength(0);

    // Y sin llevarse por delante la pertenencia de nadie mas en la plantilla.
    const plantilla = await sql`
      select 1 from public.memberships where tenant_id = ${TEMPLATE}::uuid
    `;
    expect(plantilla.length).toBeGreaterThan(0);
  });

  it('la purga nunca se lleva la plantilla', async () => {
    // Un `expires_at` puesto por error en la plantilla borraria la demostracion
    // entera y no quedaria nada que clonar. La guarda va explicita en el SQL.
    await sql`
      update public.tenants set expires_at = now() - interval '1 day' where id = ${TEMPLATE}::uuid
    `;

    await purgeExpiredDemos(TEST_DATABASE_URL);

    const rows = await sql`select 1 from public.tenants where id = ${TEMPLATE}::uuid`;
    expect(rows).toHaveLength(1);

    await sql`update public.tenants set expires_at = null where id = ${TEMPLATE}::uuid`;
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
