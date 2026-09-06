import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

/**
 * Cliente de base de datos.
 *
 * Cada opcion de aqui abajo esta puesta por una razon concreta, y omitir cualquiera
 * de ellas produce fallos que NO aparecen en desarrollo y si en produccion bajo carga.
 * Ver docs/adr/004-drizzle-sobre-postgrest.md.
 */

export type Database = PostgresJsDatabase<typeof schema>;

interface ClientOptions {
  /** Cadena de conexion. En runtime, el pooler Supavisor en el puerto 6543. */
  readonly url: string;
  /**
   * Migraciones y drizzle-kit usan conexion DIRECTA (5432) y admiten prepared
   * statements y sentencias multiples.
   */
  readonly direct?: boolean;
  readonly maxConnections?: number;
}

export function createSqlClient(options: ClientOptions): postgres.Sql {
  return postgres(options.url, {
    // Una conexion por instancia de funcion. En serverless cada invocacion puede ser
    // un proceso nuevo: sin este limite, un pico de trafico agota el pool de Supabase
    // y aparece "max client connections reached" justo cuando alguien esta mirando.
    max: options.maxConnections ?? (options.direct ? 5 : 1),

    idle_timeout: 20,
    connect_timeout: 10,

    // OBLIGATORIO contra el pooler en modo transaccion: Supavisor no soporta prepared
    // statements. Sin esto todo funciona en local y falla de forma intermitente en
    // produccion con `prepared statement "s1" does not exist`.
    prepare: options.direct ?? false,

    ssl: options.url.includes('localhost') || options.url.includes('127.0.0.1') ? false : 'require',

    // Postgres distingue NULL de "ausente"; JavaScript no. Sin esta conversion, un
    // campo opcional sin valor intentaria escribirse como la cadena "undefined".
    transform: { undefined: null },
  });
}

/**
 * Singleton a nivel de modulo.
 *
 * Vercel reutiliza la misma instancia de funcion entre invocaciones cercanas, asi que
 * guardar el cliente en el ambito del modulo evita reabrir la conexion en cada request.
 * En desarrollo se guarda ademas en `globalThis` para que el hot reload de Next no
 * acumule conexiones huerfanas hasta agotar el pool.
 */
const globalForDb = globalThis as unknown as { __corebizSql?: postgres.Sql };

export function getDatabase(url: string): Database {
  const client = globalForDb.__corebizSql ?? createSqlClient({ url });
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__corebizSql = client;
  }
  return drizzle(client, { schema });
}

export { schema };
