import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@corebiz/domain';

export const REQUIRED_PERMISSION = 'corebiz:required-permission';

/**
 * Declara que permiso hace falta para llegar a un manejador.
 *
 * El permiso es del DOMINIO (`packages/domain/src/access/role.ts`), no una cadena
 * inventada aqui: la matriz de quien puede hacer que ya existe, esta probada, y hay un
 * test de integracion que compara sus listas de roles con las politicas de Postgres.
 * Declarar una segunda matriz en decoradores seria repartir la autorizacion otra vez,
 * que es justo lo que ese archivo dice evitar.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
