import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

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
 * Cliente reutilizado, con la cache en `globalThis`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE BLOQUE ESTUVO MAL, Y EL FALLO SOLO APARECIA EN PRODUCCION CON POSTGRES.
 *
 * La version anterior guardaba el cliente en `globalThis` **solo cuando
 * NODE_ENV !== 'production'**, con la intencion de que el hot reload de Next no
 * acumulara conexiones. El efecto real era el contrario del buscado: en
 * produccion la cache no existia, asi que CADA llamada a `getDatabase()` abria
 * un pool nuevo que nadie cerraba nunca.
 *
 * En desarrollo no se nota. En serverless tampoco mucho, porque la instancia
 * muere. En un servidor de larga vida —`next start`, un contenedor, un VPS— las
 * conexiones se acumulan hasta que Postgres responde:
 *
 *     FATAL: remaining connection slots are reserved for roles with the
 *            SUPERUSER attribute
 *
 * y a partir de ahi la aplicacion deja de funcionar entera. Lo encontro la suite
 * E2E contra Postgres con NODE_ENV=production: fallaban tests sin relacion
 * aparente entre si, siempre distintos, siempre por tiempo de espera.
 *
 * Ahora la cache existe SIEMPRE. `globalThis` sigue siendo el sitio correcto,
 * pero por el motivo de siempre: el hot reload recrea los modulos, y con la
 * cache en una variable de modulo cada recarga estrenaria pool.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La clave es la URL. Un solo cliente por cadena de conexion: los tests de
 * integracion usan una distinta de la aplicacion, y compartir el mismo objeto
 * entre ambas apuntaria a la base equivocada.
 */
const globalForDb = globalThis as unknown as { __corebizSql?: Map<string, postgres.Sql> };

/**
 * Tamano del pool, por defecto UNA conexion.
 *
 * Uno es lo correcto en serverless: cada invocacion puede ser un proceso nuevo, y
 * con un pool grande por instancia un pico de trafico agota el limite de Supabase
 * justo cuando alguien esta mirando.
 *
 * Pero uno es MALO en un servidor de larga vida, porque una transaccion retiene
 * la unica conexion mientras dura y las demas peticiones esperan en fila.
 *
 * Por eso es configurable en lugar de constante: el valor por defecto protege el
 * despliegue objetivo, y quien sirva la aplicacion desde un proceso permanente
 * sube `DATABASE_MAX_CONNECTIONS` y deja de serializar su propia aplicacion.
 */
function poolSize(): number {
  const raw = Number(process.env.DATABASE_MAX_CONNECTIONS);
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
}

export function getDatabase(url: string): Database {
  const cache = (globalForDb.__corebizSql ??= new Map<string, postgres.Sql>());

  let client = cache.get(url);
  if (client === undefined) {
    client = createSqlClient({ url, maxConnections: poolSize() });
    cache.set(url, client);
  }

  return drizzle(client, { schema });
}

export { schema };
