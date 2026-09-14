import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@corebiz/prisma-client';

/**
 * El cliente de Prisma, con su pool.
 *
 * Prisma 7 ya no lleva el motor en Rust: se le entrega un adaptador de driver ya
 * conectado.
 *
 * No Rust engine also means a lighter function bundle and a faster cold start on Vercel.
 */

/**
 * La cache existe SIEMPRE, y esa palabra esta ahi por una razon.
 *
 * La version equivalente con el cliente anterior guardaba el pool en `globalThis` solo
 * fuera de produccion, con la intencion de que el hot reload no acumulase conexiones. El
 * efecto real era el contrario: en produccion no habia cache, cada llamada abria un pool
 * nuevo y nadie lo cerraba, hasta que Postgres respondia que no quedaban huecos. Lo
 * encontro la suite E2E contra Postgres, fallando tests sin relacion entre si.
 *
 * La clave es la URL: los tests de integracion usan una distinta de la aplicacion, y
 * compartir objeto apuntaria a la base equivocada.
 */
const globalForPrisma = globalThis as unknown as {
  __corebizPrisma?: Map<string, PrismaClient>;
};

/**
 * Tamano del pool, por defecto UNA conexion.
 *
 * Uno es lo correcto en serverless —cada invocacion puede ser un proceso nuevo— y MALO en
 * un servidor de larga vida, donde una transaccion retiene la unica conexion y las demas
 * peticiones esperan en fila. Por eso se configura en lugar de fijarse.
 *
 * Prisma NO lee `DATABASE_MAX_CONNECTIONS`: el limite viaja en el adaptador, y su valor
 * por defecto seria `nucleos * 2 + 1`. En un contenedor que declare ocho nucleos serian
 * diecisiete conexiones, muy por encima del presupuesto del plan gratuito de Supabase.
 */
function poolSize(): number {
  const raw = Number(process.env.DATABASE_MAX_CONNECTIONS);
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
}

/**
 * TLS to the Supabase pooler, always VERIFIED.
 *
 * Supabase signs its Postgres certificates with its own root CA, which is not in Node's
 * trust store, so `rejectUnauthorized: true` alone fails with SELF_SIGNED_CERT_IN_CHAIN.
 * The fix is to trust THAT CA — public, downloadable from the dashboard — through
 * `DATABASE_CA_CERT`, never to turn verification off: that would let anyone on the path
 * impersonate the database and read its password.
 *
 * Literal `\n` sequences are accepted because some env var editors flatten a PEM to one line.
 */
function tlsOptions(): { rejectUnauthorized: true; ca?: string } {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

function esLocal(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

export function getPrisma(url: string): PrismaClient {
  const cache = (globalForPrisma.__corebizPrisma ??= new Map<string, PrismaClient>());

  let client = cache.get(url);
  if (client === undefined) {
    /*
     * `pg` no usa sentencias preparadas con nombre salvo que se le pidan, asi que no
     * reproduce el fallo que obligaba a `prepare: false` con el driver anterior:
     * contra el pooler de Supabase en modo transaccion, una sentencia preparada
     * funciona en local y falla de forma intermitente en produccion con
     * `prepared statement "s1" does not exist`. Se deja escrito porque el sintoma es
     * dificil de atribuir y la trampa sigue existiendo para quien anada `name` a una
     * consulta.
     */
    const adapter = new PrismaPg({
      connectionString: url,
      max: poolSize(),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      ssl: esLocal(url) ? false : tlsOptions(),
    });

    client = new PrismaClient({ adapter });
    cache.set(url, client);
  }

  return client;
}
