/**
 * Roles y permisos como DATOS, no como codigo disperso en condicionales.
 *
 * La matriz de abajo es la unica fuente de verdad sobre quien puede hacer que. Se consulta
 * desde tres sitios: el caso de uso, la interfaz y las politicas RLS de Postgres.
 *
 * Lo que un test de integracion compara contra el SQL son las LISTAS de roles —`ROLES`
 * contra la restriccion de `memberships`, y `WRITE_ROLES` contra `app.can_write()`— no la
 * matriz de permisos entera. Conviene saber donde llega la red: anadir un rol nuevo aqui y
 * olvidarlo en Postgres rompe el build; cambiarle un permiso a uno que ya existe, no.
 *
 * Cuando la autorizacion vive repartida en `if (user.role === 'admin')` por toda la
 * aplicacion, tarde o temprano uno de esos condicionales se olvida. Aqui hay un solo sitio
 * que auditar.
 */

export const ROLES = ['owner', 'admin', 'sales', 'warehouse', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Permisos con forma `recurso:accion`. El comodin `*` se admite tanto como recurso
 * completo (`customer:*`) como global (`*`, exclusivo del propietario).
 */
export const PERMISSIONS = [
  'customer:read',
  'customer:write',
  'customer:delete',
  'product:read',
  'product:write',
  'product:delete',
  'stock:read',
  'stock:adjust',
  'quote:read',
  'quote:write',
  'quote:delete',
  'delivery_note:read',
  'delivery_note:issue',
  'delivery_note:deliver',
  'delivery_note:void',
  'payment:read',
  'payment:write',
  'supplier:read',
  'supplier:write',
  'purchase:read',
  'purchase:write',
  'purchase:receive',
  'report:read',
  'report:export',
  'user:read',
  'user:invite',
  'user:manage',
  'audit:read',
  'audit:export',
  'settings:read',
  'settings:write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Que puede hacer cada rol.
 *
 * Criterio de diseno: un vendedor puede EMITIR una nota de entrega pero no ANULARLA.
 * Anular revierte stock y altera el historico, asi que exige un rol con mas responsabilidad.
 * De la misma forma, quien trabaja en almacen ajusta inventario pero no toca precios.
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, readonly (Permission | '*')[]>> = {
  owner: ['*'],

  admin: [
    'customer:read',
    'customer:write',
    'customer:delete',
    'product:read',
    'product:write',
    'product:delete',
    'stock:read',
    'stock:adjust',
    'quote:read',
    'quote:write',
    'quote:delete',
    'delivery_note:read',
    'delivery_note:issue',
    'delivery_note:deliver',
    'delivery_note:void',
    'payment:read',
    'payment:write',
    'supplier:read',
    'supplier:write',
    'purchase:read',
    'purchase:write',
    'purchase:receive',
    'report:read',
    'report:export',
    'user:read',
    'user:invite',
    'user:manage',
    'audit:read',
    'settings:read',
    'settings:write',
  ],

  sales: [
    'customer:read',
    'customer:write',
    'product:read',
    'stock:read',
    'quote:read',
    'quote:write',
    'delivery_note:read',
    'delivery_note:issue',
    'payment:read',
    'payment:write',
    'report:read',
  ],

  warehouse: [
    'product:read',
    'product:write',
    'stock:read',
    'stock:adjust',
    'delivery_note:read',
    'delivery_note:deliver',
    'supplier:read',
    'purchase:read',
    'purchase:receive',
  ],

  viewer: [
    'customer:read',
    'product:read',
    'stock:read',
    'quote:read',
    'delivery_note:read',
    'payment:read',
    'supplier:read',
    'purchase:read',
  ],
};

/** Quien actua, ya autenticado y con su rol en ESTE tenant resuelto. */
export interface Actor {
  readonly userId: string;
  readonly role: Role;
}

/**
 * Unica funcion de autorizacion del sistema.
 *
 * Se llama desde el CASO DE USO, no desde el componente. Ocultar un boton en la interfaz
 * no es una medida de seguridad: cualquiera puede invocar la Server Action directamente.
 */
export function can(actor: Actor, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[actor.role];
  if (granted.includes('*')) return true;
  if (granted.includes(permission)) return true;

  // Comodin por recurso: `customer:*` cubre `customer:read`, `customer:write`, etc.
  const resource = permission.split(':')[0];
  return granted.includes(`${resource}:*` as Permission);
}

/** Comprueba varios permisos a la vez. Util cuando un caso de uso toca dos recursos. */
export function canAll(actor: Actor, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(actor, p));
}

export function permissionsOf(role: Role): readonly (Permission | '*')[] {
  return ROLE_PERMISSIONS[role];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Roles con capacidad de escritura. Se corresponde con la funcion `app.can_write()` de
 * las politicas RLS; el test de integracion verifica que ambas listas coinciden.
 */
export const WRITE_ROLES: readonly Role[] = ['owner', 'admin', 'sales', 'warehouse'];

export function canWrite(role: Role): boolean {
  return WRITE_ROLES.includes(role);
}
