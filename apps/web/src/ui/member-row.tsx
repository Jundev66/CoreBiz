'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  changeMemberRoleAction,
  removeMemberAction,
  type AdminState,
} from '@/actions/administration';
import { Badge } from '@/ui/feedback';

const INITIAL: AdminState = { status: 'idle' };

const ROLES = ['owner', 'admin', 'sales', 'warehouse', 'viewer'] as const;

export interface MemberRowData {
  readonly userId: string;
  readonly email: string | null;
  readonly role: string;
  readonly isYou: boolean;
  readonly since: string;
}

/**
 * Una fila del equipo, con su rol editable.
 *
 * El `select` se envia solo al cambiar, sin boton de guardar. En una tabla con
 * varias filas, un boton por fila obliga a recordar cual se toco; que el cambio
 * sea inmediato deja claro que ya esta hecho — y el error, si lo hay, aparece en
 * la misma fila.
 *
 * A uno mismo no se le ofrece expulsarse: es un error facil de cometer con un
 * boton al lado del propio nombre, y quien lo hace queda fuera de una empresa a
 * la que no puede volver por su cuenta. El caso de uso tambien lo impide.
 *
 * Below `sm` the row reflows into a card: the `tr` becomes a two-column grid and `order`
 * puts person and date on top, role and "remove" side by side underneath. From `sm` up it
 * is a normal table row, where `order` and the grid have no effect.
 */
export function MemberRow({ member, canManage }: { member: MemberRowData; canManage: boolean }) {
  const t = useTranslations();
  const [roleState, changeRole, changing] = useActionState(changeMemberRoleAction, INITIAL);
  const [removeState, remove, removing] = useActionState(removeMemberAction, INITIAL);

  /*
   * The WHOLE failed state, not just its key.
   *
   * The translation needs the parameters, and taking them from one state while the key
   * comes from the other would mix two different errors. With `Unexpected` it matters more
   * than it seems: when it carries an incident reference the key becomes
   * `UnexpectedWithIncident`, whose text REQUIRES `{incidentId}` — and next-intl, facing a
   * missing parameter, neither leaves a gap nor throws: it renders the raw key path.
   */
  const failed = roleState.errorKind !== undefined ? roleState : removeState;
  const error = failed.errorKind;

  return (
    <tr className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 align-top transition-colors last:border-0 hover:bg-subtle/40 sm:table-row sm:p-0">
      <td className="order-1 col-span-2 sm:px-4 sm:py-3">
        <span className="font-medium break-all text-ink sm:break-normal">
          {member.email ?? t('settings.team.noEmail')}
        </span>
        {member.isYou && (
          <span className="ml-2 align-[1px]">
            <Badge tone="brand">{t('settings.team.you')}</Badge>
          </span>
        )}
        {error !== undefined && (
          <p role="alert" className="mt-1 text-xs text-danger-ink">
            {t(`settings.errors.${error}`, failed.errorParams ?? {})}
          </p>
        )}
      </td>

      <td className="order-3 sm:px-4 sm:py-3">
        {canManage ? (
          <form action={changeRole}>
            <input type="hidden" name="userId" value={member.userId} />
            <label htmlFor={`role-${member.userId}`} className="sr-only">
              {t('settings.team.role')}
            </label>
            <select
              id={`role-${member.userId}`}
              name="role"
              defaultValue={member.role}
              disabled={changing}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="h-9 rounded-control border border-line-strong bg-surface px-2.5 text-sm text-ink shadow-xs transition-colors focus:border-brand disabled:opacity-60"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
            {/* Sin JavaScript el `onChange` no dispara, asi que hace falta una
                forma de enviar. Se oculta a los lectores de pantalla solo cuando
                hay JS no seria posible, asi que se deja visible y pequeño. */}
            <noscript>
              <button type="submit" className="ml-2 text-xs underline">
                {t('common.save')}
              </button>
            </noscript>
          </form>
        ) : (
          <span className="text-ink-soft">{t(`roles.${member.role}`)}</span>
        )}
      </td>

      <td className="order-2 col-span-2 text-xs text-muted sm:px-4 sm:py-3 sm:text-sm sm:whitespace-nowrap">
        <span className="sm:hidden">{t('settings.team.since')}: </span>
        {member.since}
      </td>

      <td className="order-4 text-right sm:px-4 sm:py-3">
        {canManage && !member.isYou && (
          <form action={remove}>
            <input type="hidden" name="userId" value={member.userId} />
            <button
              type="submit"
              disabled={removing}
              className="text-sm font-medium text-danger-ink underline-offset-4 hover:underline disabled:opacity-60"
            >
              {t('settings.team.remove')}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
