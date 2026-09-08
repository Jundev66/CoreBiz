import { loadEnv } from '../config/env';

export type DataDriver = 'postgres' | 'memory';

/**
 * Driver de datos activo.
 *
 * `memory` levanta la API completa sin Postgres ni Docker. Que eso siga siendo
 * posible despues de meter NestJS es la prueba observable de que la arquitectura
 * hexagonal es real: si el dominio conociera la base de datos, no habria forma de
 * sustituirla, y menos aun de sustituirla desde un adaptador primario distinto.
 */
export function activeDriver(): DataDriver {
  return loadEnv().DATA_DRIVER;
}

export function databaseUrl(): string {
  const url = loadEnv().DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'Falta DATABASE_URL. Arranca la base con `pnpm db:start` o usa DATA_DRIVER=memory.',
    );
  }
  return url;
}
