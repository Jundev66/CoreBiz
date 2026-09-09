import type { TenantContext } from '@corebiz/application';
import type { Prisma, PrismaClient } from '@corebiz/prisma-client';

/**
 * Una transaccion CON contexto de empresa puesto.
 *
 * La marca no es adorno. Con el adaptador anterior, el cliente y la transaccion eran
 * tipos distintos, asi que pasar el cliente donde se esperaba una transaccion no
 * compilaba. En Prisma el cliente de transaccion es un SUBTIPO ESTRUCTURAL del cliente
 * completo: ese mismo error tipa bien, y significaria que un repositorio consulta fuera
 * de la transaccion, sin `app.tenant_id` puesto y por tanto sin aislamiento.
 *
 * Es la unica garantia que se pierde al cambiar de ORM, asi que se repone a mano: solo
 * `withTenant`, `readOnly` y `asUser` producen un valor con esta marca.
 *
 * La propiedad es OBLIGATORIA, no opcional, y la diferencia es justo el punto: siendo
 * opcional cualquier cliente la satisface y la marca no rechaza nada. Lo destapo el lint
 * avisando de que las conversiones de aqui abajo sobraban — sobraban porque el tipo no
 * estaba pidiendo nada.
 */
declare const CON_CONTEXTO: unique symbol;

export type Tx = Prisma.TransactionClient & { readonly [CON_CONTEXTO]: true };

/**
 * Los limites de la transaccion, explicitos.
 *
 * Prisma trae 2 s de espera y 5 s de duracion por defecto; el driver anterior no tenia
 * ninguno. Emitir una nota de entrega toca cinco tablas, y contra una base en otra region
 * —o con el servicio recien despertado en Render— cinco segundos se agotan: la
 * transaccion revierte con P2028 y quien estaba vendiendo ve un error en una operacion
 * que era correcta.
 */
const LIMITES = { maxWait: 5_000, timeout: 20_000 } as const;

/**
 * Establece quien esta operando, para que las politicas RLS puedan decidir.
 *
 * Las tres son LOCALES a la transaccion (`true` en el tercer argumento), y eso es lo mas
 * importante de todo el adaptador. Con alcance de sesion, las variables quedarian pegadas
 * a la conexion, y el pooler en modo transaccion reutiliza esa conexion para el siguiente
 * request, que puede ser de OTRA EMPRESA. Seria una fuga entre clientes: intermitente,
 * invisible en desarrollo y visible solo bajo concurrencia.
 * Ver docs/adr/005-aislamiento-multi-tenant.md.
 *
 * Van en UNA sola sentencia a proposito: reduce a uno los sitios donde alguien podria
 * escribir `prisma.` en lugar de `tx.` — un desliz de un caracter que sacaria la llamada
 * de la transaccion y dejaria la variable en otra conexion.
 *
 * El tercer `set_config` es el equivalente exacto de `set local role authenticated`: el
 * rol es el GUC `role`. Se hace asi, y no con `$executeRawUnsafe`, para que en este
 * fichero no exista ni una llamada `Unsafe` que a nadie le tiente copiar.
 */
export async function establishTenantContext(tx: Tx, ctx: TenantContext): Promise<void> {
  const claims = JSON.stringify({ sub: ctx.actor.userId, role: 'authenticated' });

  await tx.$queryRaw`
    select set_config('app.tenant_id', ${ctx.tenantId}::text, true),
           set_config('request.jwt.claims', ${claims}::text, true),
           set_config('role', 'authenticated', true)
  `;
}

/** Ejecuta con el contexto de la empresa puesto, pudiendo escribir. */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await establishTenantContext(tx as Tx, ctx);
    return fn(tx as Tx);
  }, LIMITES);
}

/**
 * Ejecuta una lectura con el contexto puesto.
 *
 * La transaccion se marca de solo lectura antes de nada. No es una optimizacion: convierte
 * "este modelo de lectura no deberia escribir" en algo que impone la base de datos.
 *
 * `set transaction read only` tiene que ser la PRIMERA sentencia, y lo sera mientras no se
 * le pase `isolationLevel` a `$transaction`: Prisma emitiria antes su propio
 * `set transaction isolation level` y Postgres rechazaria el cambio de modo.
 */
export async function readOnly<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`set transaction read only`;
    await establishTenantContext(tx as Tx, ctx);
    return fn(tx as Tx);
  }, LIMITES);
}

/**
 * Ejecuta con la identidad del usuario puesta, pero SIN empresa activa.
 *
 * Hace falta para las dos operaciones anteriores a que exista una empresa: darla de alta
 * y preguntar "a cuales pertenezco". Ambas se apoyan en `auth.uid()`, no en
 * `app.current_tenant()`.
 *
 * Es ademas lo mas estrecho posible: aqui `app.current_tenant()` devuelve null y toda
 * politica que dependa de el niega. Lo unico que cabe hacer es llamar a las funciones
 * acotadas que la migracion expone para este momento exacto.
 */
export async function asUser<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.$queryRaw`
      select set_config('request.jwt.claims', ${claims}::text, true),
             set_config('role', 'authenticated', true)
    `;
    return fn(tx as Tx);
  }, LIMITES);
}
