import { getPrisma } from '@corebiz/db';

/**
 * Comprueba que la base de datos responde.
 *
 * Vive aqui y no en la ruta de la aplicacion por la regla `ui-no-direct-db`: la capa web
 * habla con casos de uso y adaptadores, nunca con el cliente de base de datos. Escribir el
 * `select 1` en la ruta parecia mas corto y rompia el build, que es exactamente lo que esa
 * regla existe para hacer.
 *
 * `select 1` en lugar de una consulta de negocio: comprueba que la conexion vive sin
 * depender de que exista ningun dato y sin coste medible. Y no devuelve el motivo del
 * fallo — un mensaje de Postgres lleva nombres de host, de usuario y de esquema, y esto lo
 * consume un endpoint publico.
 */
export async function databaseIsReachable(url: string): Promise<boolean> {
  try {
    await getPrisma(url).$queryRaw`select 1`;
    return true;
  } catch {
    return false;
  }
}
