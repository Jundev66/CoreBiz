import { can, type Actor, type Permission } from '@corebiz/domain';

/**
 * Which permission is needed to OPEN each module.
 *
 * One table because two consumers must agree: the sidebar, which decides which entries to
 * show, and each screen, which decides whether to read or render `NoAccess`. When these
 * were separate, the menu offered all seven modules to every role and three of them
 * crashed when clicked.
 *
 * It is not the permission matrix and does not replace it: authorization lives in `can()`
 * — this table USES it — and is enforced in the use case. This only declares which of the
 * 25 permissions is the front door of each module, a navigation decision rather than a
 * security one.
 *
 * Order follows the menu. `/` is left out on purpose: the dashboard adapts to the role by
 * itself and is where every screen leads back to, so it cannot be out of anyone's reach.
 * `/settings` has no `settings:read` requirement for the same reason: its main screen reads
 * nothing from the API — it renders what the session context already carries — and closing
 * it would leave `viewer` with no way to reach their own settings.
 */
export const MODULE_PERMISSION = {
  '/customers': 'customer:read',
  '/products': 'product:read',
  '/delivery-notes': 'delivery_note:read',
  '/purchases': 'purchase:read',
  '/reports': 'report:read',
} as const satisfies Readonly<Record<string, Permission>>;

export type ModuleRoute = keyof typeof MODULE_PERMISSION;

/** Whether this role may open the route. Routes not in the table are open to everyone. */
export function canOpen(actor: Actor, route: string): boolean {
  const permission = Object.hasOwn(MODULE_PERMISSION, route)
    ? MODULE_PERMISSION[route as ModuleRoute]
    : undefined;

  return permission === undefined || can(actor, permission);
}
