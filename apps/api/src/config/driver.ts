import { loadEnv } from './env';

/*
 * Vive en `config/` y no en `composition/`, y no es un detalle de organizacion.
 *
 * Aqui no se construye nada: se lee que modo esta activo y cual es la cadena de
 * conexion. La regla `api-modules-no-composition` impide que un controller alcance el
 * composition root —porque ahi podria fabricarse un `TenantContext` con el tenant
 * equivocado— y saltaba con este archivo dentro. Tenia razon sobre el sitio: los
 * modulos que operan ANTES de que exista un tenant (el alta, la demostracion, los
 * internos) necesitan saber el modo, y no por eso deben poder montar un contexto.
 */
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
