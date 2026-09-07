import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ROLES, WRITE_ROLES, asId, type TenantId } from '@corebiz/domain';
import { schema } from '@corebiz/db';
import { establishTenantContext } from '../src/drizzle/session';
import {
  TEST_DATABASE_URL,
  closeTestDatabase,
  createTestTenant,
  dropTestTenant,
  testDb,
  type TestTenant,
} from './support/database';

/**
 * La matriz de aislamiento.
 *
 * Las politicas RLS de este proyecto estaban escritas y eran buenas, pero hasta
 * este archivo NINGUN test las habia ejecutado. Una politica no probada es una
 * hipotesis, y publicar un SaaS multi-tenant sobre una hipotesis es exactamente
 * lo que el proyecto dice saber evitar.
 *
 * Lo que hace especial a esta suite frente a "un test de que A no ve a B": no
 * enumera tablas a mano. Descubre del catalogo TODA tabla con `tenant_id` y
 * exige que cada una este cubierta. Al anadir una tabla nueva sin politica —el
 * fallo real, el que ocurre de verdad seis meses despues— el test falla solo, sin
 * que nadie se acuerde de venir aqui a anadirla.
 *
 * El andamiaje se conecta como `postgres`, que tiene BYPASSRLS y por tanto ve
 * todo: es lo que hace falta para PREPARAR el estado y para comprobar que la fila
 * ajena existe de verdad. Si el andamiaje estuviera sometido a las mismas
 * politicas que verifica, un fallo de aislamiento pasaria desapercibido, porque
 * tampoco veria los datos que deberia estar viendo. El codigo bajo prueba, en
 * cambio, entra siempre por `set local role authenticated`.
 */

const db = testDb();

/**
 * Tablas con `tenant_id` cubiertas por la matriz generica.
 *
 * `audit_log` queda fuera a proposito y tiene su propio bloque: sus permisos de
 * UPDATE y DELETE estan REVOCADOS por GRANT, asi que no devuelve cero filas —
 * falla con permiso denegado antes de llegar a las politicas. Meterla en el bucle
 * generico convertiria esa garantia mas fuerte en un error de test.
 */
const COVERED = [
  'customers',
  'products',
  'stock_movements',
  'delivery_notes',
  'delivery_note_lines',
  'document_sequences',
  'tenant_usage',
  'memberships',
] as const;

const SPECIAL_CASED = ['audit_log'] as const;

/** Ejecuta SQL crudo con el contexto del tenant puesto y el rol ya cambiado. */
async function asTenant<T>(
  tenant: TestTenant,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await establishTenantContext(tx, tenant.ctx);
    return fn(tx);
  });
}

/**
 * Deja una fila de cada tabla cubierta perteneciente a este tenant.
 *
 * Sin esto la matriz pasaria en vacio: "cero filas visibles" no prueba nada si
 * tampoco hay filas que ver. Cada probe comprueba primero, como `postgres`, que
 * la fila ajena existe.
 */
async function seedOneRowPerTable(tenant: TestTenant): Promise<void> {
  const t = tenant.tenantId;
  const customerId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const noteId = crypto.randomUUID();

  // memberships ya la creo createTestTenant().
  await db.execute(sql`
    insert into public.customers (id, tenant_id, code, name)
    values (${customerId}, ${t}, 'CLI-RLS', 'Cliente de la matriz')
  `);

  await db.execute(sql`
    insert into public.products (id, tenant_id, sku, name, price_minor, price_currency, on_hand)
    values (${productId}, ${t}, 'SKU-RLS', 'Producto de la matriz', 1000, 'USD', 50000)
  `);

  await db.execute(sql`
    insert into public.stock_movements
      (id, tenant_id, product_id, kind, quantity, balance_after, ref_type, occurred_at)
    values (${crypto.randomUUID()}, ${t}, ${productId}, 'in', 50000, 50000, 'initial', now())
  `);

  await db.execute(sql`
    insert into public.delivery_notes (
      id, tenant_id, number, customer_id, status, currency,
      exchange_rate_scaled, exchange_rate_from, exchange_rate_to, exchange_rate_at,
      tax_label_snapshot, tax_rate_bp_snapshot,
      subtotal_minor, tax_minor, total_minor, total_secondary_minor, issued_at
    ) values (
      ${noteId}, ${t}, 'NE-RLS-001', ${customerId}, 'issued', 'USD',
      3650000000, 'USD', 'VES', now(),
      'Impuesto informativo', 1600,
      1000, 160, 1160, 42340, now()
    )
  `);

  await db.execute(sql`
    insert into public.delivery_note_lines (
      tenant_id, delivery_note_id, line_no, product_id,
      description_snapshot, unit_snapshot, quantity, unit_price_minor, line_total_minor
    ) values (${t}, ${noteId}, 1, ${productId}, 'Producto de la matriz', 'und', 1000, 1000, 1000)
  `);

  await db.execute(sql`
    insert into public.document_sequences (tenant_id, doc_type, prefix, next_number)
    values (${t}, 'delivery_note', 'NE', 2)
  `);

  await db.execute(sql`
    insert into public.tenant_usage (tenant_id, resource, period, count)
    values (${t}, 'customers', 'total', 1)
  `);

  await db.execute(sql`
    insert into public.audit_log (id, tenant_id, actor_id, action, entity_type, entity_id)
    values (${crypto.randomUUID()}, ${t}, ${tenant.userId}, 'rls.probe', 'customer', ${customerId})
  `);
}

/**
 * Mensaje completo del fallo, causas incluidas.
 *
 * Drizzle envuelve el error de Postgres en uno propio cuyo texto es la consulta,
 * no el motivo. Aserta sobre el envoltorio y el test pasaria con CUALQUIER fallo
 * —incluido un error de sintaxis—, que es justo lo contrario de lo que se quiere
 * comprobar aqui. El motivo real vive en `cause`.
 */
function chainOfMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' | ');
}

/** Exige que la base de datos rechace la operacion, y POR EL MOTIVO esperado. */
async function expectRejection(operation: Promise<unknown>, motivo: RegExp): Promise<void> {
  let captured: unknown;
  try {
    await operation;
  } catch (error) {
    captured = error;
  }

  expect(captured, 'la base de datos acepto una operacion que deberia rechazar').toBeDefined();
  expect(chainOfMessages(captured)).toMatch(motivo);
}

/** Filas que ve `postgres`, sin politicas de por medio. */
async function rowsOwnedBy(table: string, tenantId: TenantId): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.raw(`public.${table}`)} where tenant_id = ${tenantId}`,
  );
  return Number((rows[0] as { n: number }).n);
}

describe('Aislamiento multi-tenant', () => {
  let alpha: TestTenant;
  let beta: TestTenant;

  beforeAll(async () => {
    alpha = await createTestTenant({ slug: `rls-alpha-${Date.now()}` });
    beta = await createTestTenant({ slug: `rls-beta-${Date.now()}` });
    await seedOneRowPerTable(alpha);
    await seedOneRowPerTable(beta);
  });

  afterAll(async () => {
    await dropTestTenant(alpha.tenantId);
    await dropTestTenant(beta.tenantId);
    await closeTestDatabase();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // La matriz
  // ───────────────────────────────────────────────────────────────────────────

  describe('ninguna tabla deja pasar una operacion sobre datos ajenos', () => {
    it.each(COVERED)('%s', async (table) => {
      // Sin esto el test podria pasar por no haber nada que ver.
      expect(await rowsOwnedBy(table, beta.tenantId)).toBeGreaterThan(0);

      const [visible, updated, deleted] = await asTenant(alpha, async (tx) => {
        const seen = await tx.execute(
          sql`select count(*)::int as n from ${sql.raw(`public.${table}`)}
               where tenant_id = ${beta.tenantId}`,
        );

        // `set tenant_id = tenant_id` es un update valido que no cambia nada: sirve
        // para probar CUALQUIER tabla sin conocer sus columnas. Lo que se mide es
        // cuantas filas alcanza, y el USING de la politica tiene que dejarlo en cero.
        const touched = await tx.execute(
          sql`update ${sql.raw(`public.${table}`)} set tenant_id = tenant_id
               where tenant_id = ${beta.tenantId} returning 1`,
        );

        const removed = await tx.execute(
          sql`delete from ${sql.raw(`public.${table}`)}
               where tenant_id = ${beta.tenantId} returning 1`,
        );

        return [Number((seen[0] as { n: number }).n), touched.length, removed.length];
      });

      expect(visible).toBe(0);
      expect(updated).toBe(0);
      expect(deleted).toBe(0);

      // Y la fila ajena sigue intacta: nada de lo anterior la toco.
      expect(await rowsOwnedBy(table, beta.tenantId)).toBeGreaterThan(0);
    });
  });

  it('cubre todas las tablas con tenant_id que existen en el esquema', async () => {
    const rows = await db.execute(sql`
      select table_name
        from information_schema.columns
       where table_schema = 'public' and column_name = 'tenant_id'
       order by table_name
    `);

    const inSchema = rows.map((r) => (r as { table_name: string }).table_name);
    const covered = [...COVERED, ...SPECIAL_CASED].sort();

    // Este es el test que de verdad protege el proyecto a largo plazo. El dia que
    // alguien anada `suppliers` o `purchase_orders` y se olvide de la politica,
    // esta comparacion falla sola y nadie tiene que acordarse de nada.
    expect(inSchema.sort()).toEqual(covered);
  });

  it('mantiene row level security habilitada Y FORZADA en todas ellas', async () => {
    const rows = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    `);

    const flags = new Map(
      rows.map((r) => {
        const row = r as { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean };
        return [row.relname, row];
      }),
    );

    for (const table of [...COVERED, ...SPECIAL_CASED]) {
      // FORCE no es un extra: sin el, el PROPIETARIO de la tabla se salta sus
      // propias politicas. Como la aplicacion puede acabar conectando con un rol
      // que resulte ser el owner, sin FORCE el aislamiento seria una ilusion.
      expect(flags.get(table)).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // El with check del update
  // ───────────────────────────────────────────────────────────────────────────

  it('impide mover una fila propia al tenant ajeno cambiandole el tenant_id', async () => {
    // El USING dejaria pasar esta escritura: la fila ES de alpha. Lo que la para
    // es el WITH CHECK, que mira la fila RESULTANTE. Sin el, cualquiera con
    // permiso de escritura podria regalarle sus datos a otro tenant — o
    // colocarselos.
    await expectRejection(
      asTenant(alpha, (tx) =>
        tx.execute(sql`
          update public.customers set tenant_id = ${beta.tenantId}
           where tenant_id = ${alpha.tenantId} and code = 'CLI-RLS'
        `),
      ),
      /row-level security/i,
    );

    expect(await rowsOwnedBy('customers', alpha.tenantId)).toBe(1);
  });

  it('impide insertar una fila a nombre de otro tenant', async () => {
    await expectRejection(
      asTenant(alpha, (tx) =>
        tx.execute(sql`
          insert into public.customers (id, tenant_id, code, name)
          values (${crypto.randomUUID()}, ${beta.tenantId}, 'CLI-INTRUSO', 'No deberia entrar')
        `),
      ),
      /row-level security/i,
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // La fuga por GUC pegada a la conexion
  // ───────────────────────────────────────────────────────────────────────────

  it('no arrastra el contexto de una transaccion a la siguiente en la MISMA conexion', async () => {
    // Esta es la prueba directa de por que `set_config(..., true)` lleva ese
    // `true`. Con `false`, la variable quedaria pegada a la CONEXION, y Supavisor
    // —el pooler, en modo transaccion— entrega esa misma conexion al siguiente
    // request, que puede ser de otro cliente. La fuga seria intermitente,
    // invisible en desarrollo y visible solo bajo concurrencia: la peor clase.
    //
    // `max: 1` fuerza que las dos transacciones compartan conexion, que es la
    // condicion que hay que reproducir. El test comprueba ademas que realmente la
    // compartieron: si cada una fuese a un backend distinto, pasaria en vacio.
    const client = postgres(TEST_DATABASE_URL, { max: 1, prepare: false, ssl: false });
    const single = drizzle(client, { schema });

    try {
      const first = await single.transaction(async (tx) => {
        await establishTenantContext(tx, alpha.ctx);
        const seen = await tx.execute(
          sql`select count(*)::int as n from public.customers where tenant_id = ${alpha.tenantId}`,
        );
        const pid = await tx.execute(sql`select pg_backend_pid()::int as pid`);
        return {
          rows: Number((seen[0] as { n: number }).n),
          pid: Number((pid[0] as { pid: number }).pid),
        };
      });

      expect(first.rows).toBe(1);

      const second = await single.transaction(async (tx) => {
        // A proposito NO se establece contexto: se comprueba que la transaccion
        // anterior no dejo el suyo puesto.
        const leaked = await tx.execute(
          sql`select current_setting('app.tenant_id', true) as tenant_id`,
        );
        const pid = await tx.execute(sql`select pg_backend_pid()::int as pid`);
        return {
          tenantId: (leaked[0] as { tenant_id: string | null }).tenant_id,
          pid: Number((pid[0] as { pid: number }).pid),
        };
      });

      expect(second.pid).toBe(first.pid);
      expect(second.tenantId === null || second.tenantId === '').toBe(true);

      // Y el rol tampoco se queda pegado: `set local role` se deshace al confirmar.
      const third = await single.transaction(async (tx) => {
        await establishTenantContext(tx, beta.ctx);
        const seen = await tx.execute(sql`
          select
            count(*) filter (where tenant_id = ${beta.tenantId})::int  as propias,
            count(*) filter (where tenant_id = ${alpha.tenantId})::int as ajenas
          from public.customers
        `);
        return seen[0] as { propias: number; ajenas: number };
      });

      expect(Number(third.propias)).toBe(1);
      expect(Number(third.ajenas)).toBe(0);
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // El registro de auditoria
  // ───────────────────────────────────────────────────────────────────────────

  describe('audit_log', () => {
    it('deja escribir y leer las entradas propias', async () => {
      const entryId = crypto.randomUUID();

      await asTenant(alpha, (tx) =>
        tx.execute(sql`
          insert into public.audit_log (id, tenant_id, actor_id, action)
          values (${entryId}, ${alpha.tenantId}, ${alpha.userId}, 'customer.created')
        `),
      );

      const rows = await asTenant(alpha, (tx) =>
        tx.execute(sql`select action from public.audit_log where id = ${entryId}`),
      );

      expect(rows).toHaveLength(1);
    });

    it('no deja modificar ni borrar lo ya registrado', async () => {
      // La garantia no es solo la politica: los privilegios de UPDATE y DELETE
      // estan REVOCADOS. Una politica se sustituye con un `create policy`
      // posterior; revocar el privilegio es mas dificil de deshacer por descuido.
      // Un registro de auditoria que se puede editar no es un registro de
      // auditoria.
      await expectRejection(
        asTenant(alpha, (tx) =>
          tx.execute(
            sql`update public.audit_log set action = 'manipulado'
                 where tenant_id = ${alpha.tenantId}`,
          ),
        ),
        /permission denied/i,
      );

      await expectRejection(
        asTenant(alpha, (tx) =>
          tx.execute(sql`delete from public.audit_log where tenant_id = ${alpha.tenantId}`),
        ),
        /permission denied/i,
      );
    });

    it('solo lo leen owner y admin', async () => {
      const vendedor = await createTestTenant({ role: 'sales', slug: `rls-sales-${Date.now()}` });
      try {
        await db.execute(sql`
          insert into public.audit_log (id, tenant_id, actor_id, action)
          values (${crypto.randomUUID()}, ${vendedor.tenantId}, ${vendedor.userId}, 'probe')
        `);

        const rows = await asTenant(vendedor, (tx) =>
          tx.execute(sql`select 1 from public.audit_log`),
        );

        // La auditoria dice quien hizo que. Que la lea cualquiera con permiso de
        // escritura convierte una medida de control en un panel de vigilancia
        // entre companeros.
        expect(rows).toHaveLength(0);
      } finally {
        await dropTestTenant(vendedor.tenantId);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Coherencia entre el dominio y las politicas
  // ───────────────────────────────────────────────────────────────────────────

  describe('las politicas dicen lo mismo que el dominio', () => {
    async function rolesNamedIn(fn: string): Promise<readonly string[]> {
      const rows = await db.execute(
        sql`select pg_get_functiondef(${sql.raw(`'app.${fn}'::regprocedure`)}) as src`,
      );
      const src = (rows[0] as { src: string }).src;
      // Anclado a `current_role()` a proposito: un `/in\s*\(/` suelto acierta
      // dentro del PROPIO NOMBRE de la funcion —`is_adm` + `in()`— y devuelve una
      // lista vacia que hace pasar la comparacion contraria.
      const list = /current_role\(\)\s*in\s*\(([^)]*)\)/i.exec(src)?.[1] ?? '';
      return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();
    }

    it('app.can_write() reconoce exactamente los WRITE_ROLES del dominio', async () => {
      // El dominio decide quien escribe y Postgres lo repite. Que diverjan
      // significa que la aplicacion permite algo que la base de datos niega —o,
      // mucho peor, al reves.
      expect(await rolesNamedIn('can_write()')).toEqual([...WRITE_ROLES].sort());
    });

    it('app.is_admin() reconoce exactamente los roles administrativos', async () => {
      expect(await rolesNamedIn('is_admin()')).toEqual(['admin', 'owner']);
    });

    it('la restriccion de memberships admite exactamente los ROLES del dominio', async () => {
      const rows = await db.execute(sql`
        select pg_get_constraintdef(oid) as def
          from pg_constraint
         where conname = 'memberships_role_check'
      `);
      const def = (rows[0] as { def: string }).def;
      const found = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();

      expect(found).toEqual([...ROLES].sort());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // La conexion de la aplicacion
  // ───────────────────────────────────────────────────────────────────────────

  it('opera con un rol que NO puede saltarse las politicas', async () => {
    // El complemento necesario de todo lo anterior. `postgres` y `service_role`
    // tienen BYPASSRLS: si la aplicacion se quedara operando con uno de ellos,
    // cada test de esta suite seguiria en verde y el aislamiento no existiria.
    // Lo que lo garantiza es el `set local role authenticated` del Unit of Work.
    const rows = await asTenant(alpha, (tx) =>
      tx.execute(sql`
        select current_user::text as usuario,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypassa,
               (select rolsuper     from pg_roles where rolname = current_user) as es_super
      `),
    );

    expect(rows[0]).toMatchObject({
      usuario: 'authenticated',
      bypassa: false,
      es_super: false,
    });
  });

  it('deja fuera al miembro suspendido y al tenant caducado', async () => {
    // app.is_member() comprueba tambien el estado: un sandbox caducado deja de
    // ser accesible EN EL ACTO, sin esperar a que el cron lo purgue. La purga es
    // higiene de espacio; esto es la medida de seguridad.
    const efimero = await createTestTenant({ slug: `rls-ttl-${Date.now()}` });
    try {
      await seedOneRowPerTable(efimero);

      const antes = await asTenant(efimero, (tx) =>
        tx.execute(sql`select 1 from public.customers`),
      );
      expect(antes).toHaveLength(1);

      await db.execute(sql`
        update public.tenants set is_demo = true, expires_at = now() - interval '1 hour'
         where id = ${asId<TenantId>(efimero.tenantId)}
      `);

      const despues = await asTenant(efimero, (tx) =>
        tx.execute(sql`select 1 from public.customers`),
      );
      expect(despues).toHaveLength(0);
    } finally {
      await dropTestTenant(efimero.tenantId);
    }
  });
});
