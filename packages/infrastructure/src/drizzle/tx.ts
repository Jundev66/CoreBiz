import type { Database } from '@corebiz/db';

/**
 * Tipo de la transaccion de Drizzle, derivado de la propia firma.
 *
 * Se saca asi en lugar de nombrar los genericos internos de `PgTransaction`
 * porque esos son detalle de implementacion del ORM y cambian entre versiones.
 *
 * Vive en su propio modulo para que los repositorios puedan tiparse sin importar
 * el Unit of Work, que a su vez los importa a ellos. Aunque fuese un import solo
 * de tipos, `pnpm arch` cuenta esa dependencia y romperia el build por ciclo — y
 * hace bien: un ciclo es un ciclo aunque desaparezca al compilar.
 */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
